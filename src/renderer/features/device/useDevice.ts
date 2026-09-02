import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_BAUD_RATE } from '../../../shared/constants/serial';
import type { BleDeviceInfo } from '../../../shared/types/ble';
import type { DeviceMessage, DeviceStatusEvent } from '../../../shared/types/device';
import type { SerialPortInfo } from '../../../shared/types/serial';

const MAX_MESSAGES = 500;

export type DeviceMode = 'ble' | 'serial';

export const useDevice = () => {
  const [mode, setMode] = useState<DeviceMode>('ble');
  const [bleDevices, setBleDevices] = useState<BleDeviceInfo[]>([]);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [status, setStatus] = useState<DeviceStatusEvent>({ transport: 'ble', status: 'idle' });
  const [messages, setMessages] = useState<DeviceMessage[]>([]);

  useEffect(() => {
    const offDiscovered = window.electronAPI.ble.onDeviceDiscovered((device) => {
      setBleDevices((current) => {
        const next = current.filter((d) => d.id !== device.id);
        return [...next, device].sort((a, b) => b.rssi - a.rssi);
      });
    });

    const offStatus = window.electronAPI.device.onStatusChanged(setStatus);

    const offMessage = window.electronAPI.device.onMessage((message) => {
      setMessages((current) => [...current, message].slice(-MAX_MESSAGES));
    });

    return () => {
      offDiscovered();
      offStatus();
      offMessage();
    };
  }, []);

  const scanBle = useCallback(() => {
    setBleDevices([]);
    return window.electronAPI.ble.startScan();
  }, []);

  const stopBleScan = useCallback(() => window.electronAPI.ble.stopScan(), []);

  const connectBle = useCallback((deviceId: string) => {
    setMessages([]);
    return window.electronAPI.ble.connect(deviceId);
  }, []);

  const listSerialPorts = useCallback(async () => {
    const ports = await window.electronAPI.serial.listPorts();
    setSerialPorts(ports);
    return ports;
  }, []);

  const connectSerial = useCallback((path: string, baudRate: number = DEFAULT_BAUD_RATE) => {
    setMessages([]);
    return window.electronAPI.serial.connect(path, baudRate);
  }, []);

  const disconnect = useCallback(() => window.electronAPI.device.disconnect(), []);
  const writeCommand = useCallback((data: Uint8Array) => window.electronAPI.device.writeCommand(data), []);
  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    mode,
    setMode,
    bleDevices,
    serialPorts,
    status,
    messages,
    scanBle,
    stopBleScan,
    connectBle,
    listSerialPorts,
    connectSerial,
    disconnect,
    writeCommand,
    clearMessages,
  };
};

export type UseDeviceResult = ReturnType<typeof useDevice>;
