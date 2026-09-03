import type { DeviceConnectionStatus } from '../../../shared/types/device';
import type { DeviceMode } from './useDevice';

interface ConnectionChoiceScreenProps {
  onSelect: (mode: DeviceMode) => void;
  /** Live status of each transport, shown on its option even while the
   * other one is on screen — both keep connecting/reading/writing in the
   * background regardless of which screen is displayed, see
   * agentMemory/memories/device-transport-abstraction.md. */
  bleStatus: DeviceConnectionStatus;
  serialStatus: DeviceConnectionStatus;
}

const ConnectionChoiceScreen = ({ onSelect, bleStatus, serialStatus }: ConnectionChoiceScreenProps) => {
  return (
    <div className="connection-choice">
      <p className="connection-choice-subtitle">How will you connect to the Master target?</p>
      <div className="connection-choice-options">
        <button type="button" className="connection-choice-option" onClick={() => onSelect('serial')}>
          <span className="connection-choice-icon" aria-hidden="true">
            🔌
          </span>
          <span className="connection-choice-label">USB Port</span>
          <span className="connection-choice-desc">Connect over a wired serial connection</span>
          <span className={`ble-status ble-status--${serialStatus}`}>{serialStatus}</span>
        </button>
        <button type="button" className="connection-choice-option" onClick={() => onSelect('ble')}>
          <span className="connection-choice-icon" aria-hidden="true">
            📶
          </span>
          <span className="connection-choice-label">Bluetooth</span>
          <span className="connection-choice-desc">Scan for a nearby BLE target</span>
          <span className={`ble-status ble-status--${bleStatus}`}>{bleStatus}</span>
        </button>
      </div>
    </div>
  );
};

export default ConnectionChoiceScreen;
