import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_BAUD_RATE } from '../../../shared/constants/serial';
import { DEFAULT_DEVICE_SETTINGS } from '../../../shared/constants/settings';
import type { BleDeviceInfo } from '../../../shared/types/ble';
import type { SipSyncKind } from '../../../shared/types/commands';
import type { DeviceMessage, DeviceStatusEvent } from '../../../shared/types/device';
import type { SerialPortInfo } from '../../../shared/types/serial';
import type { DeviceSettings } from '../../../shared/types/settings';

const MAX_MESSAGES = 500;

export type DeviceMode = 'ble' | 'serial';

/** Matches the device's SIP reply so we can tell which sync kind (S/L) it
 * just confirmed — same `SIP:<lane>:<kind>:...` shape as the outgoing
 * command (`encodeSip` in deviceCommandProtocol.ts), reparsed here since
 * that module lives under electron/main and isn't importable from renderer
 * code. See agentMemory/memories/sip-time-sync-protocol.md. */
const SIP_REPLY_KIND = /^SIP:\d+:([SL]):/;

const parseSipReplyKind = (message: DeviceMessage): SipSyncKind | null => {
  if (message.direction !== 'in') return null;
  const match = SIP_REPLY_KIND.exec(message.text);
  return (match?.[1] as SipSyncKind | undefined) ?? null;
};

export const useDevice = () => {
  const [mode, setMode] = useState<DeviceMode>('ble');
  const [bleDevices, setBleDevices] = useState<BleDeviceInfo[]>([]);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [status, setStatus] = useState<DeviceStatusEvent>({ transport: 'ble', status: 'idle' });
  const [messages, setMessages] = useState<DeviceMessage[]>([]);
  // Which SIP sync kind the device last confirmed via its reply (not set on
  // send — only once a matching `SIP:<lane>:<kind>:...` reply comes back).
  // Neither is active until the first reply arrives, and a reply for one
  // kind deactivates the other — see agentMemory/memories/sip-time-sync-protocol.md.
  const [sipMode, setSipMode] = useState<SipSyncKind | null>(null);
  const [settings, setSettings] = useState<DeviceSettings>(DEFAULT_DEVICE_SETTINGS);
  // The one settings field currently mid-write, if any. Only one at a time:
  // writes are serialized so a field's row can show a loading state until
  // its write settles, and so two fields never race each other over the
  // same BLE characteristic.
  const [pendingSettingsField, setPendingSettingsField] = useState<keyof DeviceSettings | null>(null);
  // Set when a write's FUK confirmation times out (or the device
  // disconnects mid-write); cleared at the start of the next attempt.
  const [settingsError, setSettingsError] = useState<string | null>(null);

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
      const sipKind = parseSipReplyKind(message);
      if (sipKind) setSipMode(sipKind);
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
    setSipMode(null);
    // The device's actual settings aren't read back on connect, so the UI
    // resets to the same defaults the main process assumes — see
    // agentMemory/memories/ble-settings-write-protocol.md.
    setSettings(DEFAULT_DEVICE_SETTINGS);
    setPendingSettingsField(null);
    setSettingsError(null);
    return window.electronAPI.ble.connect(deviceId);
  }, []);

  const listSerialPorts = useCallback(async () => {
    const ports = await window.electronAPI.serial.listPorts();
    setSerialPorts(ports);
    return ports;
  }, []);

  const connectSerial = useCallback((path: string, baudRate: number = DEFAULT_BAUD_RATE) => {
    setMessages([]);
    setSipMode(null);
    return window.electronAPI.serial.connect(path, baudRate);
  }, []);

  const disconnect = useCallback(() => window.electronAPI.device.disconnect(), []);
  const writeCommand = useCallback((data: Uint8Array) => window.electronAPI.device.writeCommand(data), []);
  const writeSip = useCallback((kind: SipSyncKind) => window.electronAPI.device.writeSip(kind), []);
  const writeInfo = useCallback(() => window.electronAPI.device.writeInfo(), []);
  const clearMessages = useCallback(() => setMessages([]), []);

  // Re-selecting the field's already-confirmed value is a no-op — skips the
  // write entirely, no loading state. Otherwise shows `key` as pending
  // until the device's FUK reply confirms the write (main process waits
  // for it — see agentMemory/memories/settings-write-implementation.md),
  // and only then applies the *confirmed* values (not just what was
  // requested) to `settings`. A timed-out/disconnected write leaves
  // `settings` unchanged and surfaces `settingsError` instead.
  const writeSettings = useCallback(
    async (key: keyof DeviceSettings, value: number) => {
      if (settings[key] === value) return;

      setPendingSettingsField(key);
      setSettingsError(null);
      try {
        const confirmed = await window.electronAPI.ble.writeSettings({
          [key]: value,
        } as Partial<DeviceSettings>);
        setSettings(confirmed);
      } catch (error) {
        setSettingsError(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingSettingsField(null);
      }
    },
    [settings],
  );

  return {
    mode,
    setMode,
    bleDevices,
    serialPorts,
    status,
    messages,
    sipMode,
    settings,
    pendingSettingsField,
    settingsError,
    scanBle,
    stopBleScan,
    connectBle,
    listSerialPorts,
    connectSerial,
    disconnect,
    writeCommand,
    writeSip,
    writeInfo,
    writeSettings,
    clearMessages,
  };
};

export type UseDeviceResult = ReturnType<typeof useDevice>;
