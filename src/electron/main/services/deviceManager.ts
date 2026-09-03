import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc/channels';
import type { DeviceMessage, DeviceStatusEvent, DeviceTransportKind } from '../../../shared/types/device';
import type { SipSyncKind } from '../../../shared/types/commands';
import type { DeviceSettings } from '../../../shared/types/settings';
import { encodeInfo, encodeSip } from './deviceCommandProtocol';

/**
 * The common surface both bleService and serialService register when they
 * successfully connect. BLE and serial can both be connected at the same
 * time — each transport keeps its own slot in `DeviceManager.active` (see
 * agentMemory/memories/device-transport-abstraction.md) — but each service
 * enforces at most one device of its own kind at a time.
 */
export interface ActiveDeviceTransport {
  readonly kind: DeviceTransportKind;
  write(data: Uint8Array): Promise<void>;
  writeSettings(partial: Partial<DeviceSettings>): Promise<DeviceSettings>;
  disconnect(): Promise<void>;
}

class DeviceManager {
  /**
   * One slot per transport kind — both can be connected at once (see
   * agentMemory/memories/device-transport-abstraction.md). Every method
   * below that used to implicitly mean "the" active transport now takes an
   * explicit `transport` argument to say which slot it means.
   */
  private readonly active: Record<DeviceTransportKind, ActiveDeviceTransport | null> = {
    ble: null,
    serial: null,
  };

  setActive(transport: DeviceTransportKind, value: ActiveDeviceTransport | null): void {
    this.active[transport] = value;
  }

  isConnected(transport: DeviceTransportKind): boolean {
    return this.active[transport] !== null;
  }

  async writeCommand(transport: DeviceTransportKind, data: Uint8Array): Promise<void> {
    const active = this.active[transport];
    if (!active) {
      throw new Error('No device connected');
    }
    await active.write(data);
  }

  /**
   * Writes a plain-text command line over the given transport and
   * publishes it as an outgoing message, so it shows up in the terminal
   * like the FU1/FU2 settings writes do. Shared by writeSip and writeInfo
   * — see agentMemory/memories/sip-time-sync-protocol.md. Both are
   * fire-and-forget: no reply is awaited.
   */
  private async writeLine(transport: DeviceTransportKind, line: string): Promise<void> {
    const active = this.active[transport];
    if (!active) {
      throw new Error('No device connected');
    }
    // `line` is always plain ASCII (digits/letters/colons — e.g. "INFO01",
    // "SIP:01:S:14030742"), so utf8 vs ascii encoding is equivalent here;
    // `active.write` hands this Buffer straight to the wire unchanged for
    // both transports (serialService.write does `port.write(Buffer.from(data), ...)`
    // with no re-encoding — see agentMemory/memories/sip-time-sync-protocol.md).
    //
    // A BLE characteristic write is self-framed (one write = one complete
    // message), but a serial line is a continuous byte stream — the
    // firmware needs an explicit terminator to know a command is finished,
    // or it never replies. Confirmed \r\n over serial; BLE is left as-is
    // (unterminated, matching the RN reference's FU1/FU2 writes) since
    // that path isn't reported broken and characteristic writes don't need
    // one. See agentMemory/memories/sip-time-sync-protocol.md.
    const wireLine = transport === 'serial' ? `${line}\r\n` : line;
    const buffer = Buffer.from(wireLine, 'utf8');
    await active.write(buffer);
    this.publishMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      transport,
      source: 'command',
      direction: 'out',
      hex: buffer.toString('hex'),
      text: line,
    });
  }

  /** `SIP:01:<kind>:hhmmsscc` time-sync command, `kind` being `S` or `L`. */
  async writeSip(transport: DeviceTransportKind, kind: SipSyncKind): Promise<void> {
    await this.writeLine(transport, encodeSip(kind));
  }

  /** `INFO01` command. */
  async writeInfo(transport: DeviceTransportKind): Promise<void> {
    await this.writeLine(transport, encodeInfo());
  }

  /** FU1/FU2 settings write, waiting for the device's FUK confirmation —
   * see agentMemory/memories/ble-settings-write-protocol.md. Delegates to
   * whichever service (bleService/serialService) is active for `transport`,
   * since the wire framing/wait differs per transport. */
  async writeSettings(transport: DeviceTransportKind, partial: Partial<DeviceSettings>): Promise<DeviceSettings> {
    const active = this.active[transport];
    if (!active) {
      throw new Error('No device connected');
    }
    return active.writeSettings(partial);
  }

  async disconnect(transport: DeviceTransportKind): Promise<void> {
    const active = this.active[transport];
    if (!active) return;
    await active.disconnect();
  }

  broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
  }

  setStatus(event: DeviceStatusEvent): void {
    this.broadcast(IPC_CHANNELS.deviceStatusChanged, event);
  }

  publishMessage(message: DeviceMessage): void {
    this.broadcast(IPC_CHANNELS.deviceMessageReceived, message);
  }
}

export const deviceManager = new DeviceManager();
