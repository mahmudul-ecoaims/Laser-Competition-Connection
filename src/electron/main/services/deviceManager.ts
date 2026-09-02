import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc/channels';
import type { DeviceMessage, DeviceStatusEvent, DeviceTransportKind } from '../../../shared/types/device';

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
