import type { DeviceMode } from './useDevice';

interface ConnectionChoiceScreenProps {
  onSelect: (mode: DeviceMode) => void;
}

const ConnectionChoiceScreen = ({ onSelect }: ConnectionChoiceScreenProps) => {
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
        </button>
        <button type="button" className="connection-choice-option" onClick={() => onSelect('ble')}>
          <span className="connection-choice-icon" aria-hidden="true">
            📶
          </span>
          <span className="connection-choice-label">Bluetooth</span>
          <span className="connection-choice-desc">Scan for a nearby BLE target</span>
        </button>
      </div>
    </div>
  );
};

export default ConnectionChoiceScreen;
