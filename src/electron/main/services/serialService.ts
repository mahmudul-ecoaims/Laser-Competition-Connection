import { SerialPort } from 'serialport';
import { EventEmitter } from 'node:events';
import { DEFAULT_BAUD_RATE } from '../../../shared/constants/serial';
import { DEFAULT_DEVICE_SETTINGS } from '../../../shared/constants/settings';
import type { SerialPortInfo } from '../../../shared/types/serial';
import type { DeviceSettings } from '../../../shared/types/settings';
import { encodeFukWrite, parseFukMessage, SETTINGS_CONFIRMATION_TIMEOUT_MS } from './deviceSettingsProtocol';
import { deviceManager } from './deviceManager';
import { MessageFramer } from './messageFramer';

/** How long to wait with no new bytes before treating whatever's sitting
 * unterminated in the framer as a complete message anyway — see
 * MessageFramer.flush(). Comfortably longer than one line takes to arrive
 * at any reasonable baud rate, short enough not to delay a genuinely
 * unterminated reply's confirmation noticeably. */
const IDLE_FLUSH_MS = 200;

/**
 * Talks to the same target device over a wired serial (USB) connection,
 * using the `serialport` package. Produces the exact same DeviceMessage /
 * DeviceStatusEvent shapes as bleService — see
 * agentMemory/memories/device-transport-abstraction.md — via the shared
 * MessageFramer, so the renderer's terminal doesn't need to know which
 * transport is active.
 */
class SerialService {
  private port: SerialPort | null = null;
  private readonly framer = new MessageFramer();
  private idleFlushTimer: NodeJS.Timeout | null = null;
  /**
   * Settings last confirmed by the device's FUK echo, reset to defaults on
   * each connect — mirrors bleService's `currentSettings`, but the write
   * protocol itself is NOT shared with BLE: serial uses a single `FUK:...`
   * write (see `encodeFukWrite`), not BLE's two-line FU1/FU2 pair — see
   * agentMemory/memories/serial-settings-write-protocol.md.
   */
  private currentSettings: DeviceSettings = { ...DEFAULT_DEVICE_SETTINGS };
  /** Emits 'fuk' with the parsed settings (or null on disconnect) whenever
   * an incoming FUK message arrives, so writeSettings can wait for the
   * device's confirmation of the write it just sent. */
  private readonly fukEvents = new EventEmitter();

  async listPorts(): Promise<SerialPortInfo[]> {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      vendorId: port.vendorId,
      productId: port.productId,
      pnpId: port.pnpId,
      locationId: port.locationId,
    }));
  }

  async connect(path: string, baudRate: number = DEFAULT_BAUD_RATE): Promise<void> {
    if (this.port?.isOpen) {
      await this.disconnect();
    }

    deviceManager.setStatus({ transport: 'serial', status: 'connecting', targetId: path });
    this.framer.reset();
    if (this.idleFlushTimer) {
      clearTimeout(this.idleFlushTimer);
      this.idleFlushTimer = null;
    }
    this.currentSettings = { ...DEFAULT_DEVICE_SETTINGS };

    try {
      const port = await new Promise<SerialPort>((resolve, reject) => {
        const opened = new SerialPort({ path, baudRate }, (error) => {
          if (error) reject(error);
          else resolve(opened);
        });
      });

      this.port = port;

      port.on('data', (chunk: Buffer) => {
        for (const line of this.framer.push(chunk)) {
          this.handleIncomingLine(line);
        }

        // Reset the idle-flush window on every chunk, terminated or not —
        // if nothing new shows up for IDLE_FLUSH_MS, whatever's left
        // unterminated in the framer gets treated as a complete message.
        // See MessageFramer.flush() for why this exists (a reply that never
        // gets its own trailing \r/\n would otherwise sit invisible
        // forever, which is indistinguishable from the device never
        // replying at all).
        if (this.idleFlushTimer) clearTimeout(this.idleFlushTimer);
        this.idleFlushTimer = setTimeout(() => {
          this.idleFlushTimer = null;
          const leftover = this.framer.flush();
          if (leftover) this.handleIncomingLine(leftover);
        }, IDLE_FLUSH_MS);
      });

      port.on('close', () => {
        this.port = null;
        if (this.idleFlushTimer) {
          clearTimeout(this.idleFlushTimer);
          this.idleFlushTimer = null;
        }
        deviceManager.setActive('serial', null);
        // Serial has no "disconnected" state distinct from "idle" (unlike
        // BLE, which shows a brief 'disconnected' before settling) — once
        // the port closes it just goes back to idle.
        deviceManager.setStatus({ transport: 'serial', status: 'idle', targetId: path });
        // Unstick any writeSettings() still waiting on a FUK confirmation
        // instead of making it wait out the full timeout — mirrors
        // bleService's peripheral 'disconnect' handler.
        this.fukEvents.emit('fuk', null);
      });

      port.on('error', (error) => {
        deviceManager.setStatus({
          transport: 'serial',
          status: 'error',
          targetId: path,
          message: error.message,
        });
      });

      deviceManager.setActive('serial', {
        kind: 'serial',
        write: (data) => this.write(data),
        writeSettings: (partial) => this.writeSettings(partial),
        // Serial has only one wire, no separate "characteristic" — same
        // underlying write as `write()`, see ActiveDeviceTransport.writeGenericCommand.
        writeGenericCommand: (data) => this.write(data),
        disconnect: () => this.disconnect(),
      });
      deviceManager.setStatus({ transport: 'serial', status: 'connected', targetId: path });
    } catch (error) {
      deviceManager.setStatus({
        transport: 'serial',
        status: 'error',
        targetId: path,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const port = this.port;
    if (!port?.isOpen) return;

    deviceManager.setStatus({ transport: 'serial', status: 'disconnecting', targetId: port.path });
    await new Promise<void>((resolve, reject) => {
      port.close((error) => (error ? reject(error) : resolve()));
    });
  }

  /** Publishes one complete (or idle-flushed, see IDLE_FLUSH_MS) incoming
   * line as a DeviceMessage and checks it for a FUK confirmation. Shared by
   * the normal per-chunk path and the idle-flush path so both treat a line
   * identically regardless of how its end was detected. */
  private handleIncomingLine(line: Buffer): void {
    const text = line.toString('utf8');
    deviceManager.publishMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      transport: 'serial',
      source: 'serial',
      direction: 'in',
      hex: line.toString('hex'),
      text,
    });

    const fuk = parseFukMessage(text);
    if (fuk) this.fukEvents.emit('fuk', fuk);
  }

  async write(data: Uint8Array): Promise<void> {
    const port = this.port;
    if (!port?.isOpen) {
      throw new Error('Serial port not connected');
    }

    await new Promise<void>((resolve, reject) => {
      port.write(Buffer.from(data), (error) => (error ? reject(error) : resolve()));
    });
  }

  /**
   * Merges `partial` into the last-confirmed settings and, if anything
   * actually changed, pushes a single `FUK:...` write (see
   * `encodeFukWrite`/agentMemory/memories/serial-settings-write-protocol.md
   * — NOT the BLE FU1/FU2 pair, a completely separate wire format), then
   * waits for the device's FUK echo to confirm it before resolving. Throws
   * if no FUK arrives within `SETTINGS_CONFIRMATION_TIMEOUT_MS` (or the
   * port closes mid-wait) — callers should treat the settings as
   * unconfirmed/unchanged in that case. Per spec this write is only
   * effective in Standby mode; in Live mode the device sends no reply at
   * all, which surfaces here as the same timeout as a dead connection —
   * the caller (gated by `serialSipMode === 'S'` in the renderer) is
   * responsible for only offering this while standby is confirmed.
   */
  async writeSettings(partial: Partial<DeviceSettings>): Promise<DeviceSettings> {
    if (!this.port?.isOpen) {
      throw new Error('Serial port not connected');
    }

    const next: DeviceSettings = { ...this.currentSettings, ...partial };
    const unchanged = (Object.keys(next) as (keyof DeviceSettings)[]).every(
      (key) => next[key] === this.currentSettings[key],
    );
    if (unchanged) return this.currentSettings;

    await this.writeSettingsLine(encodeFukWrite(next));

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

  // Unlike a BLE characteristic write (self-framed — one write is one
  // complete message), a serial line is a continuous byte stream, so the
  // firmware needs an explicit `\r\n` terminator to know the command is
  // finished — see agentMemory/memories/sip-time-sync-protocol.md.
  private async writeSettingsLine(line: string): Promise<void> {
    const buffer = Buffer.from(`${line}\r\n`, 'utf8');
    await this.write(buffer);
    // `write()`'s callback only means the bytes were handed to the OS, not
    // that they've actually gone out over the wire (see the `serialport`
    // docs on `drain()`) — wait for the actual flush before publishing the
    // outgoing message / starting the FUK confirmation wait.
    const port = this.port;
    if (port?.isOpen) {
      await new Promise<void>((resolve, reject) => {
        port.drain((error) => (error ? reject(error) : resolve()));
      });
    }
    deviceManager.publishMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      transport: 'serial',
      source: 'settings',
      direction: 'out',
      hex: buffer.toString('hex'),
      text: line,
    });
  }
}

export const serialService = new SerialService();
