/**
 * Transport-agnostic device types. The target device can be reached over
 * BLE or a wired serial (USB) connection — only one at a time (see
 * agentMemory/memories/device-transport-abstraction.md) — and both feed the
 * same status/message shapes so the UI doesn't need to care which is active.
 */

export type DeviceTransportKind = 'ble' | 'serial';

export type DeviceConnectionStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

export interface DeviceStatusEvent {
  transport: DeviceTransportKind;
  status: DeviceConnectionStatus;
  /** BLE peripheral id or serial port path, when known. */
  targetId?: string;
  message?: string;
}

/** Which characteristic (BLE) or stream (serial) a message came from. */
export type DeviceMessageSource = 'command' | 'settings' | 'serial';

/** Whether a message was received from the device or sent to it. */
export type DeviceMessageDirection = 'in' | 'out';

export interface DeviceMessage {
  id: string;
  timestamp: number;
  transport: DeviceTransportKind;
  source: DeviceMessageSource;
  direction: DeviceMessageDirection;
  /** Raw bytes as hex, e.g. "0a1f3c". */
  hex: string;
  /** UTF-8 decoded text. */
  text: string;
}
