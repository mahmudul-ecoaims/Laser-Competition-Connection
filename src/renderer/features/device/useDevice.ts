import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_BAUD_RATE } from '../../../shared/constants/serial';
import { DEFAULT_DEVICE_SETTINGS } from '../../../shared/constants/settings';
import type { BleDeviceInfo } from '../../../shared/types/ble';
import type { SipSyncKind } from '../../../shared/types/commands';
import type { DeviceMessage, DeviceStatusEvent, DeviceTransportKind } from '../../../shared/types/device';
import type { SerialPortInfo } from '../../../shared/types/serial';
import type { DeviceSettings } from '../../../shared/types/settings';

const MAX_MESSAGES = 500;

export type DeviceMode = DeviceTransportKind;

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
  // BLE and serial connect, read, and write independently and at the same
  // time (see agentMemory/memories/device-transport-abstraction.md) — every
  // piece of state below that used to be a single shared value is now one
  // value per transport. `mode`/`setMode` is purely which screen is
  // currently displayed (App.tsx); it does not gate which transport(s) are
  // actually connected — both keep running regardless of which is shown.
  const [mode, setMode] = useState<DeviceMode>('ble');
  const [bleDevices, setBleDevices] = useState<BleDeviceInfo[]>([]);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [bleStatus, setBleStatus] = useState<DeviceStatusEvent>({ transport: 'ble', status: 'idle' });
  const [serialStatus, setSerialStatus] = useState<DeviceStatusEvent>({ transport: 'serial', status: 'idle' });
  const [bleMessages, setBleMessages] = useState<DeviceMessage[]>([]);
  const [serialMessages, setSerialMessages] = useState<DeviceMessage[]>([]);
  // Which SIP sync kind each transport's device last confirmed via its
  // reply (not set on send — only once a matching `SIP:<lane>:<kind>:...`
  // reply comes back). Neither is active until the first reply arrives, and
  // a reply for one kind deactivates the other — see
  // agentMemory/memories/sip-time-sync-protocol.md.
  const [bleSipMode, setBleSipMode] = useState<SipSyncKind | null>(null);
  const [serialSipMode, setSerialSipMode] = useState<SipSyncKind | null>(null);
  // Settings state is one pair per transport, same as messages/status/SIP
  // mode above — BLE and serial can both be connected (and mid-write) at
  // once, so a single shared value would let one transport's write clobber
  // the other's displayed state.
  const [bleSettings, setBleSettings] = useState<DeviceSettings>(DEFAULT_DEVICE_SETTINGS);
  const [serialSettings, setSerialSettings] = useState<DeviceSettings>(DEFAULT_DEVICE_SETTINGS);
  // The one settings field currently mid-write per transport, if any. Only
  // one at a time per transport: writes are serialized so a field's row can
  // show a loading state until its write settles, and so two fields never
  // race each other over the same write channel.
  const [blePendingSettingsField, setBlePendingSettingsField] = useState<keyof DeviceSettings | null>(null);
  const [serialPendingSettingsField, setSerialPendingSettingsField] = useState<keyof DeviceSettings | null>(null);
  // Set when a write's FUK confirmation times out (or the device
  // disconnects mid-write); cleared at the start of the next attempt.
  const [bleSettingsError, setBleSettingsError] = useState<string | null>(null);
  const [serialSettingsError, setSerialSettingsError] = useState<string | null>(null);

  useEffect(() => {
    const offDiscovered = window.electronAPI.ble.onDeviceDiscovered((device) => {
      setBleDevices((current) => {
        const next = current.filter((d) => d.id !== device.id);
        return [...next, device].sort((a, b) => b.rssi - a.rssi);
      });
    });

    const offStatus = window.electronAPI.device.onStatusChanged((event) => {
      if (event.transport === 'ble') setBleStatus(event);
      else setSerialStatus(event);
    });

    const offMessage = window.electronAPI.device.onMessage((message) => {
      const setMessages = message.transport === 'ble' ? setBleMessages : setSerialMessages;
      setMessages((current) => [...current, message].slice(-MAX_MESSAGES));
      const sipKind = parseSipReplyKind(message);
      if (sipKind) {
        if (message.transport === 'ble') setBleSipMode(sipKind);
        else setSerialSipMode(sipKind);
      }
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
    setBleMessages([]);
    setBleSipMode(null);
    // The device's actual settings aren't read back on connect, so the UI
    // resets to the same defaults the main process assumes — see
    // agentMemory/memories/ble-settings-write-protocol.md.
    setBleSettings(DEFAULT_DEVICE_SETTINGS);
    setBlePendingSettingsField(null);
    setBleSettingsError(null);
    return window.electronAPI.ble.connect(deviceId);
  }, []);

  const listSerialPorts = useCallback(async () => {
    // Clear the current list first so a re-scan doesn't show stale ports
    // while the new scan is in flight — the list only reappears once the
    // fresh result comes back.
    setSerialPorts([]);
    const ports = await window.electronAPI.serial.listPorts();
    setSerialPorts(ports);
    return ports;
  }, []);

  const connectSerial = useCallback((path: string, baudRate: number = DEFAULT_BAUD_RATE) => {
    setSerialMessages([]);
    setSerialSipMode(null);
    // Mirrors connectBle's reset — see agentMemory/memories/ble-settings-write-protocol.md.
    setSerialSettings(DEFAULT_DEVICE_SETTINGS);
    setSerialPendingSettingsField(null);
    setSerialSettingsError(null);
    return window.electronAPI.serial.connect(path, baudRate);
  }, []);

  const disconnect = useCallback(
    (transport: DeviceTransportKind) => window.electronAPI.device.disconnect(transport),
    [],
  );
  const writeCommand = useCallback(
    (transport: DeviceTransportKind, data: Uint8Array) => window.electronAPI.device.writeCommand(transport, data),
    [],
  );
  const writeSip = useCallback(
    (transport: DeviceTransportKind, kind: SipSyncKind) => window.electronAPI.device.writeSip(transport, kind),
    [],
  );
  const writeInfo = useCallback(
    (transport: DeviceTransportKind) => window.electronAPI.device.writeInfo(transport),
    [],
  );
  const clearMessages = useCallback((transport: DeviceTransportKind) => {
    if (transport === 'ble') setBleMessages([]);
    else setSerialMessages([]);
  }, []);

  // Re-selecting the field's already-confirmed value is a no-op — skips the
  // write entirely, no loading state. Otherwise shows `key` as pending
  // until the device's FUK reply confirms the write (main process waits
  // for it — see agentMemory/memories/settings-write-implementation.md),
  // and only then applies the *confirmed* values (not just what was
  // requested) to that transport's `settings`. A timed-out/disconnected
  // write leaves `settings` unchanged and surfaces `settingsError` instead.
  const writeSettings = useCallback(
    async (transport: DeviceTransportKind, key: keyof DeviceSettings, value: number) => {
      const current = transport === 'ble' ? bleSettings : serialSettings;
      if (current[key] === value) return;

      const setPending = transport === 'ble' ? setBlePendingSettingsField : setSerialPendingSettingsField;
      const setError = transport === 'ble' ? setBleSettingsError : setSerialSettingsError;
      const applyConfirmed = transport === 'ble' ? setBleSettings : setSerialSettings;

      setPending(key);
      setError(null);
      try {
        const confirmed = await window.electronAPI.device.writeSettings(transport, {
          [key]: value,
        } as Partial<DeviceSettings>);
        applyConfirmed(confirmed);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setPending(null);
      }
    },
    [bleSettings, serialSettings],
  );

  return {
    mode,
    setMode,
    bleDevices,
    serialPorts,
    bleStatus,
    serialStatus,
    bleMessages,
    serialMessages,
    bleSipMode,
    serialSipMode,
    bleSettings,
    serialSettings,
    blePendingSettingsField,
    serialPendingSettingsField,
    bleSettingsError,
    serialSettingsError,
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
