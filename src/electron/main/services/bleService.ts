import noble, { type Characteristic, type Peripheral } from '@abandonware/noble';
import { EventEmitter } from 'node:events';
import { BLE_SCAN_TIMEOUT_MS, BLE_UUIDS } from '../../../shared/constants/ble';
import { DEFAULT_DEVICE_SETTINGS } from '../../../shared/constants/settings';
import { IPC_CHANNELS } from '../../../shared/ipc/channels';
import type { BleDeviceInfo } from '../../../shared/types/ble';
import type { DeviceMessageSource } from '../../../shared/types/device';
import type { DeviceSettings } from '../../../shared/types/settings';
import {
  encodeFu1,
  encodeFu2,
  parseFukMessage,
  SETTINGS_CONFIRMATION_TIMEOUT_MS,
} from './deviceSettingsProtocol';
import { deviceManager } from './deviceManager';
import { MessageFramer } from './messageFramer';

/**
 * Talks to the laser-competition target device's GATT service using
 * @abandonware/noble (Node's cross-platform BLE central role).
 *
 * Runs entirely in the main process: the renderer never touches noble
 * directly, it only sees plain data over IPC (see registerHandlers.ts).
 * Connect/disconnect/write ultimately go through `deviceManager`, which is
 * transport-agnostic (see [[device-transport-abstraction]] in
 * agentMemory/memories).
 */
class BleService {
  private readonly discovered = new Map<string, Peripheral>();
  private connectedPeripheral: Peripheral | null = null;
  private commandCharacteristic: Characteristic | null = null;
  private settingsCharacteristic: Characteristic | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;
  private readonly framers = new Map<DeviceMessageSource, MessageFramer>();
  /**
   * Settings last confirmed by the device's FUK echo, reset to defaults on
   * each connect (not read back from the device until the first write is
   * confirmed) — see agentMemory/memories/ble-settings-write-protocol.md.
   */
  private currentSettings: DeviceSettings = { ...DEFAULT_DEVICE_SETTINGS };
  /** Emits 'fuk' with the parsed settings (or null on disconnect) whenever
   * an incoming FUK message arrives, so writeSettings can wait for the
   * device's confirmation of the write it just sent. */
  private readonly fukEvents = new EventEmitter();

  constructor() {
    noble.on('discover', (peripheral) => {
      this.discovered.set(peripheral.id, peripheral);
      deviceManager.broadcast(IPC_CHANNELS.bleDeviceDiscovered, this.toDeviceInfo(peripheral));
    });

    noble.on('stateChange', (state) => {
      if (state !== 'poweredOn') {
        void this.stopScan();
      }
    });
  }

  private toDeviceInfo(peripheral: Peripheral): BleDeviceInfo {
    return {
      id: peripheral.id,
      name: peripheral.advertisement?.localName ?? null,
      rssi: peripheral.rssi,
    };
  }

  private getFramer(source: DeviceMessageSource): MessageFramer {
    let framer = this.framers.get(source);
    if (!framer) {
      framer = new MessageFramer();
      this.framers.set(source, framer);
    }
    return framer;
  }

  private async waitForPoweredOn(): Promise<void> {
    if (noble._state === 'poweredOn') return;

    await new Promise<void>((resolve, reject) => {
      const onStateChange = (state: string) => {
        if (state === 'poweredOn') {
          noble.removeListener('stateChange', onStateChange);
          resolve();
        } else if (state === 'unauthorized' || state === 'unsupported') {
          noble.removeListener('stateChange', onStateChange);
          reject(new Error(`Bluetooth adapter is ${state}`));
        }
      };
      noble.on('stateChange', onStateChange);
    });
  }

  async startScan(): Promise<void> {
    this.discovered.clear();
    await this.waitForPoweredOn();

    deviceManager.setStatus({ transport: 'ble', status: 'scanning' });
    await noble.startScanningAsync([BLE_UUIDS.SERVICE], false);

    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    this.scanTimeout = setTimeout(() => {
      void this.stopScan();
    }, BLE_SCAN_TIMEOUT_MS);
  }

  async stopScan(): Promise<void> {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    await noble.stopScanningAsync();
    if (!this.connectedPeripheral) {
      deviceManager.setStatus({ transport: 'ble', status: 'idle' });
    }
  }

  private async subscribeToNotifications(characteristic: Characteristic, source: DeviceMessageSource) {
    if (!characteristic.properties.includes('notify') && !characteristic.properties.includes('indicate')) {
      return;
    }

    const framer = this.getFramer(source);
    characteristic.on('data', (data: Buffer) => {
      for (const line of framer.push(data)) {
        const text = line.toString('utf8');
        deviceManager.publishMessage({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          transport: 'ble',
          source,
          direction: 'in',
          hex: line.toString('hex'),
          text,
        });

        // The RN reference only subscribes to notifications on the command
        // characteristic, so FUK arrives there in practice — but parse it
        // regardless of `source` in case firmware ever echoes it elsewhere.
        const fuk = parseFukMessage(text);
        if (fuk) this.fukEvents.emit('fuk', fuk);
      }
    });

    await characteristic.subscribeAsync();
  }

  async connect(deviceId: string): Promise<void> {
    const peripheral = this.discovered.get(deviceId);
    if (!peripheral) {
      throw new Error(`Unknown device id: ${deviceId}`);
    }

    // At most one BLE device connected at a time — drop the current one
    // first (mirrors serialService's same guard for serial ports).
    if (this.connectedPeripheral) {
      await this.disconnect();
    }

    await this.stopScan();
    deviceManager.setStatus({ transport: 'ble', status: 'connecting', targetId: deviceId });
    this.framers.clear();
    this.currentSettings = { ...DEFAULT_DEVICE_SETTINGS };

    peripheral.once('disconnect', () => {
      this.connectedPeripheral = null;
      this.commandCharacteristic = null;
      this.settingsCharacteristic = null;
      deviceManager.setActive('ble', null);
      deviceManager.setStatus({ transport: 'ble', status: 'disconnected', targetId: deviceId });
      // Unstick any writeSettings() still waiting on a FUK confirmation
      // instead of making it wait out the full timeout.
      this.fukEvents.emit('fuk', null);
    });

    try {
      await peripheral.connectAsync();

      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [BLE_UUIDS.SERVICE],
        [BLE_UUIDS.COMMAND_CHARACTERISTIC, BLE_UUIDS.SETTINGS_CHARACTERISTIC],
      );

      this.commandCharacteristic =
        characteristics.find((c) => c.uuid === BLE_UUIDS.COMMAND_CHARACTERISTIC) ?? null;
      this.settingsCharacteristic =
        characteristics.find((c) => c.uuid === BLE_UUIDS.SETTINGS_CHARACTERISTIC) ?? null;

      if (!this.commandCharacteristic) {
        throw new Error('Command characteristic not found on device');
      }

      await this.subscribeToNotifications(this.commandCharacteristic, 'command');
      if (this.settingsCharacteristic) {
        await this.subscribeToNotifications(this.settingsCharacteristic, 'settings');
      }

      this.connectedPeripheral = peripheral;
      deviceManager.setActive('ble', {
        kind: 'ble',
        write: (data) => this.writeCommand(data),
        disconnect: () => this.disconnect(),
      });
      deviceManager.setStatus({ transport: 'ble', status: 'connected', targetId: deviceId });
    } catch (error) {
      deviceManager.setStatus({
        transport: 'ble',
        status: 'error',
        targetId: deviceId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connectedPeripheral) return;
    deviceManager.setStatus({
      transport: 'ble',
      status: 'disconnecting',
      targetId: this.connectedPeripheral.id,
    });
    await this.connectedPeripheral.disconnectAsync();
  }

  async writeCommand(data: Uint8Array): Promise<void> {
    if (!this.commandCharacteristic) {
      throw new Error('Not connected to a device');
    }
    await this.commandCharacteristic.writeAsync(Buffer.from(data), false);
  }

  /**
   * Merges `partial` into the last-confirmed settings and, if anything
   * actually changed, pushes the FU1/FU2 writes documented in
   * agentMemory/memories/ble-settings-write-protocol.md (mirroring the
   * companion RN app's diff-and-skip-if-unchanged behavior), then waits for
   * the device's FUK echo to confirm them before resolving. Throws if no
   * FUK arrives within `SETTINGS_CONFIRMATION_TIMEOUT_MS` (or the device
   * disconnects mid-wait) — callers should treat the settings as
   * unconfirmed/unchanged in that case.
   */
  async writeSettings(partial: Partial<DeviceSettings>): Promise<DeviceSettings> {
    if (!this.settingsCharacteristic) {
      throw new Error('Settings characteristic not available on this device');
    }

    const next: DeviceSettings = { ...this.currentSettings, ...partial };
    const unchanged = (Object.keys(next) as (keyof DeviceSettings)[]).every(
      (key) => next[key] === this.currentSettings[key],
    );
    if (unchanged) return this.currentSettings;

    await this.writeSettingsLine(encodeFu1(next));
    await this.writeSettingsLine(encodeFu2(next));

    const confirmed = await this.waitForFukConfirmation(SETTINGS_CONFIRMATION_TIMEOUT_MS);
    if (!confirmed) {
      throw new Error('Timed out waiting for the device to confirm the new settings (no FUK reply)');
    }

    this.currentSettings = confirmed;
    return confirmed;
  }

  private waitForFukConfirmation(timeoutMs: number): Promise<DeviceSettings | null> {
    return new Promise((resolve) => {
      const onFuk = (settings: DeviceSettings | null) => {
        clearTimeout(timer);
        resolve(settings);
      };
      const timer = setTimeout(() => {
        this.fukEvents.off('fuk', onFuk);
        resolve(null);
      }, timeoutMs);
      this.fukEvents.once('fuk', onFuk);
    });
  }

  private async writeSettingsLine(line: string): Promise<void> {
    const buffer = Buffer.from(line, 'utf8');
    await this.settingsCharacteristic!.writeAsync(buffer, false);
    deviceManager.publishMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      transport: 'ble',
      source: 'settings',
      direction: 'out',
      hex: buffer.toString('hex'),
      text: line,
    });
  }
}

export const bleService = new BleService();
