import noble, { type Characteristic, type Peripheral } from '@abandonware/noble';
import { BLE_SCAN_TIMEOUT_MS, BLE_UUIDS } from '../../../shared/constants/ble';
import { IPC_CHANNELS } from '../../../shared/ipc/channels';
import type { BleDeviceInfo } from '../../../shared/types/ble';
import type { DeviceMessageSource } from '../../../shared/types/device';
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
        deviceManager.publishMessage({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          transport: 'ble',
          source,
          hex: line.toString('hex'),
          text: line.toString('utf8'),
        });
      }
    });

    await characteristic.subscribeAsync();
  }

  async connect(deviceId: string): Promise<void> {
    const peripheral = this.discovered.get(deviceId);
    if (!peripheral) {
      throw new Error(`Unknown device id: ${deviceId}`);
    }

    await this.stopScan();
    deviceManager.setStatus({ transport: 'ble', status: 'connecting', targetId: deviceId });
    this.framers.clear();

    peripheral.once('disconnect', () => {
      this.connectedPeripheral = null;
      this.commandCharacteristic = null;
      this.settingsCharacteristic = null;
      deviceManager.setActive(null);
      deviceManager.setStatus({ transport: 'ble', status: 'disconnected', targetId: deviceId });
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
      deviceManager.setActive({
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

  async writeSettings(data: Uint8Array): Promise<void> {
    if (!this.settingsCharacteristic) {
      throw new Error('Settings characteristic not available on this device');
    }
    await this.settingsCharacteristic.writeAsync(Buffer.from(data), false);
  }
}

export const bleService = new BleService();
