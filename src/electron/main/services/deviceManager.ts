import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc/channels';
import type { DeviceMessage, DeviceStatusEvent, DeviceTransportKind } from '../../../shared/types/device';
import type { SipSyncKind } from '../../../shared/types/commands';
import { encodeInfo, encodeSip } from './deviceCommandProtocol';

/**
 * The common surface both bleService and serialService register when they
 * successfully connect. Only one transport is active at a time (see
 * agentMemory/memories/device-transport-abstraction.md) — connecting one
 * way implies the other is not connected.
 */
export interface ActiveDeviceTransport {
  readonly kind: DeviceTransportKind;
  write(data: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
}

class DeviceManager {
  private active: ActiveDeviceTransport | null = null;

  setActive(transport: ActiveDeviceTransport | null): void {
    this.active = transport;
  }

  getActiveKind(): DeviceTransportKind | null {
    return this.active?.kind ?? null;
  }

  async writeCommand(data: Uint8Array): Promise<void> {
    if (!this.active) {
      throw new Error('No device connected');
    }
    await this.active.write(data);
  }

  /**
   * Writes a plain-text command line over whichever transport is active
   * and publishes it as an outgoing message, so it shows up in the
   * terminal like the FU1/FU2 settings writes do. Shared by writeSip and
   * writeInfo — see agentMemory/memories/sip-time-sync-protocol.md. Both
   * are fire-and-forget: no reply is awaited.
   */
  private async writeLine(line: string): Promise<void> {
    if (!this.active) {
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
    const wireLine = this.active.kind === 'serial' ? `${line}\r\n` : line;
    const buffer = Buffer.from(wireLine, 'utf8');
    await this.active.write(buffer);
    this.publishMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      transport: this.active.kind,
      source: 'command',
      direction: 'out',
      hex: buffer.toString('hex'),
      text: line,
    });
  }

  /** `SIP:01:<kind>:hhmmsscc` time-sync command, `kind` being `S` or `L`. */
  async writeSip(kind: SipSyncKind): Promise<void> {
    await this.writeLine(encodeSip(kind));
  }

  /** `INFO01` command. */
  async writeInfo(): Promise<void> {
    await this.writeLine(encodeInfo());
  }

  async disconnectActive(): Promise<void> {
    if (!this.active) return;
    await this.active.disconnect();
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
