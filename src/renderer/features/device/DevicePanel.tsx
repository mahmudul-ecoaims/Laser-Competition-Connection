import { useState } from 'react';
import { COMMON_BAUD_RATES, DEFAULT_BAUD_RATE } from '../../../shared/constants/serial';
import type { SerialPortInfo } from '../../../shared/types/serial';
import SerialPortInfoModal from './SerialPortInfoModal';
import type { UseDeviceResult } from './useDevice';

interface DevicePanelProps {
  device: UseDeviceResult;
}

const DevicePanel = ({ device }: DevicePanelProps) => {
  const {
    mode,
    bleDevices,
    serialPorts,
    bleStatus,
    serialStatus,
    bleSipMode,
    serialSipMode,
    scanBle,
    stopBleScan,
    connectBle,
    listSerialPorts,
    connectSerial,
    disconnect,
    writeSip,
    writeInfo,
  } = device;

  // This panel only renders one transport at a time (whichever screen is
  // showing), but both keep connecting/reading/writing independently in the
  // background — see agentMemory/memories/device-transport-abstraction.md.
  const status = mode === 'ble' ? bleStatus : serialStatus;
  const sipMode = mode === 'ble' ? bleSipMode : serialSipMode;

  const [baudRate, setBaudRate] = useState(DEFAULT_BAUD_RATE);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [infoPort, setInfoPort] = useState<SerialPortInfo | null>(null);

  const runCommand = async (send: () => Promise<void>) => {
    setCommandError(null);
    try {
      await send();
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
    }
  };

  const isScanning = status.status === 'scanning';
  const isConnected = status.status === 'connected';
  const isConnecting = status.status === 'connecting';
  const isDisconnecting = status.status === 'disconnecting';
  const connectedTargetId = isConnected ? status.targetId : undefined;
  const connectionLocksList = isConnected || isConnecting || isDisconnecting;

  // While connected, hide every other discovered device/port — only the
  // connected one is shown. Disconnecting re-triggers a fresh scan (below)
  // so the full list comes back once it's no longer connected.
  const visibleBleDevices = isConnected ? bleDevices.filter((d) => d.id === connectedTargetId) : bleDevices;
  const visibleSerialPorts = isConnected ? serialPorts.filter((p) => p.path === connectedTargetId) : serialPorts;

  const disconnectBleAndRescan = () => void disconnect(mode).then(() => scanBle());
  const disconnectSerialAndRescan = () => void disconnect(mode).then(() => listSerialPorts());

  return (
    <div className="ble-panel">
      <div className="ble-panel-header">
        <div className="ble-panel-heading">
          <h2>{mode === 'ble' ? 'Bluetooth' : 'USB / Serial'}</h2>
        </div>
        <span className={`ble-status ble-status--${status.status}`}>{status.status}</span>
      </div>

      {mode === 'ble' ? (
        <>
          <div className="ble-actions">
            <button type="button" onClick={() => void scanBle()} disabled={isScanning || connectionLocksList}>
              Scan
            </button>
            <button type="button" onClick={() => void stopBleScan()} disabled={!isScanning}>
              Stop scan
            </button>
          </div>

          <ul className="ble-device-list">
            {visibleBleDevices.map((bleDevice) => {
              const isSelected = connectedTargetId === bleDevice.id;

              return (
                <li key={bleDevice.id} className={isSelected ? 'ble-device-list-item--selected' : undefined}>
                  <span>{bleDevice.name ?? 'Unknown device'}</span>
                  <span className="ble-device-rssi">{bleDevice.rssi} dBm</span>
                  <button
                    type="button"
                    className={isSelected ? 'device-disconnect-button' : undefined}
                    onClick={() => (isSelected ? disconnectBleAndRescan() : void connectBle(bleDevice.id))}
                    disabled={!isSelected && connectionLocksList}
                  >
                    {isSelected ? 'Disconnect' : 'Connect'}
                  </button>
                </li>
              );
            })}
            {visibleBleDevices.length === 0 && <li className="ble-device-empty">No devices found yet.</li>}
          </ul>
        </>
      ) : (
        <>
          <div className="ble-actions">
            <button type="button" onClick={() => void listSerialPorts()} disabled={connectionLocksList}>
              Scan
            </button>
            <label className="serial-baud">
              Baud
              <select
                value={baudRate}
                onChange={(event) => setBaudRate(Number(event.target.value))}
                disabled={connectionLocksList}
              >
                {COMMON_BAUD_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ul className="ble-device-list">
            {visibleSerialPorts.map((port) => {
              const isSelected = connectedTargetId === port.path;

              return (
                <li key={port.path} className={isSelected ? 'ble-device-list-item--selected' : undefined}>
                  <span>{port.path}</span>
                  <span className="ble-device-rssi">{port.manufacturer ?? 'Unknown manufacturer'}</span>
                  <button type="button" onClick={() => setInfoPort(port)}>
                    More info
                  </button>
                  <button
                    type="button"
                    className={isSelected ? 'device-disconnect-button' : undefined}
                    onClick={() => (isSelected ? disconnectSerialAndRescan() : void connectSerial(port.path, baudRate))}
                    disabled={!isSelected && connectionLocksList}
                  >
                    {isSelected ? 'Disconnect' : 'Connect'}
                  </button>
                </li>
              );
            })}
            {visibleSerialPorts.length === 0 && (
              <li className="ble-device-empty">No ports found - click Refresh.</li>
            )}
          </ul>
        </>
      )}

      {isConnected && (
        <div className="ble-actions ble-actions--commands">
          <button
            type="button"
            className={sipMode === 'S' ? 'sip-mode-button--active' : undefined}
            aria-pressed={sipMode === 'S'}
            onClick={() => void runCommand(() => writeSip(mode, 'S'))}
          >
            Standby mode
          </button>
          <button
            type="button"
            className={sipMode === 'L' ? 'sip-mode-button--active' : undefined}
            aria-pressed={sipMode === 'L'}
            onClick={() => void runCommand(() => writeSip(mode, 'L'))}
          >
            Live mode
          </button>
          <button type="button" onClick={() => void runCommand(() => writeInfo(mode))}>
            Request Info
          </button>
        </div>
      )}

      {status.message && <p className="ble-error">{status.message}</p>}
      {commandError && <p className="ble-error">{commandError}</p>}

      {infoPort && <SerialPortInfoModal port={infoPort} onClose={() => setInfoPort(null)} />}
    </div>
  );
};

export default DevicePanel;
