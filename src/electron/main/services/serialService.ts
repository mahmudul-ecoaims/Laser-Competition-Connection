import { SerialPort } from 'serialport';
import { DEFAULT_BAUD_RATE } from '../../../shared/constants/serial';
import type { SerialPortInfo } from '../../../shared/types/serial';
import { deviceManager } from './deviceManager';
import { MessageFramer } from './messageFramer';

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
          deviceManager.publishMessage({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            transport: 'serial',
            source: 'serial',
            direction: 'in',
            hex: line.toString('hex'),
            text: line.toString('utf8'),
          });
        }
      });

      port.on('close', () => {
        this.port = null;
        deviceManager.setActive(null);
        deviceManager.setStatus({ transport: 'serial', status: 'disconnected', targetId: path });
      });

      port.on('error', (error) => {
        deviceManager.setStatus({
          transport: 'serial',
          status: 'error',
          targetId: path,
          message: error.message,
        });
      });

      deviceManager.setActive({
        kind: 'serial',
        write: (data) => this.write(data),
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

  async write(data: Uint8Array): Promise<void> {
    const port = this.port;
    if (!port?.isOpen) {
      throw new Error('Serial port not connected');
    }

    await new Promise<void>((resolve, reject) => {
      port.write(Buffer.from(data), (error) => (error ? reject(error) : resolve()));
    });
  }
}

export const serialService = new SerialService();
