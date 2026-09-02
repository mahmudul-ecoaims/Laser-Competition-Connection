import { useState } from 'react';
import { COMMON_BAUD_RATES, DEFAULT_BAUD_RATE } from '../../../shared/constants/serial';
import type { UseDeviceResult } from './useDevice';

interface DevicePanelProps {
  device: UseDeviceResult;
}

const DevicePanel = ({ device }: DevicePanelProps) => {
  const {
    mode,
    bleDevices,
    serialPorts,
    status,
    scanBle,
    stopBleScan,
    connectBle,
    listSerialPorts,
    connectSerial,
    disconnect,
  } = device;

  const [baudRate, setBaudRate] = useState(DEFAULT_BAUD_RATE);

  const isScanning = status.status === 'scanning';
  const isConnected = status.status === 'connected';
  const isConnecting = status.status === 'connecting';
  const isDisconnecting = status.status === 'disconnecting';
  const connectedTargetId = isConnected && status.transport === mode ? status.targetId : undefined;
  const connectionLocksList = isConnected || isConnecting || isDisconnecting;

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
            {bleDevices.map((bleDevice) => {
              const isSelected = connectedTargetId === bleDevice.id;

              return (
                <li key={bleDevice.id} className={isSelected ? 'ble-device-list-item--selected' : undefined}>
                  <span>{bleDevice.name ?? 'Unknown device'}</span>
                  <span className="ble-device-rssi">{bleDevice.rssi} dBm</span>
                  {isSelected && <span className="device-selected-badge">Selected</span>}
                  <button
                    type="button"
                    onClick={() => void (isSelected ? disconnect() : connectBle(bleDevice.id))}
                    disabled={!isSelected && connectionLocksList}
                  >
                    {isSelected ? 'Disconnect' : 'Connect'}
                  </button>
                </li>
              );
            })}
            {bleDevices.length === 0 && <li className="ble-device-empty">No devices found yet.</li>}
          </ul>
        </>
      ) : (
        <>
          <div className="ble-actions">
            <button type="button" onClick={() => void listSerialPorts()} disabled={connectionLocksList}>
              Refresh ports
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
            {serialPorts.map((port) => {
              const isSelected = connectedTargetId === port.path;

              return (
                <li key={port.path} className={isSelected ? 'ble-device-list-item--selected' : undefined}>
                  <span>{port.path}</span>
                  <span className="ble-device-rssi">{port.manufacturer ?? 'Unknown manufacturer'}</span>
                  {isSelected && <span className="device-selected-badge">Selected</span>}
                  <button
                    type="button"
                    onClick={() => void (isSelected ? disconnect() : connectSerial(port.path, baudRate))}
                    disabled={!isSelected && connectionLocksList}
                  >
                    {isSelected ? 'Disconnect' : 'Connect'}
                  </button>
                </li>
              );
            })}
            {serialPorts.length === 0 && (
              <li className="ble-device-empty">No ports found - click Refresh.</li>
            )}
          </ul>
        </>
      )}

      {status.message && <p className="ble-error">{status.message}</p>}
    </div>
  );
};

export default DevicePanel;
