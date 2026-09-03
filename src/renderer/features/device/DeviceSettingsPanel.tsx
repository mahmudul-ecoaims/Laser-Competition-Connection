import { DEVICE_SETTINGS_FIELDS } from '../../../shared/constants/settings';
import type { DeviceTransportKind } from '../../../shared/types/device';
import type { UseDeviceResult } from './useDevice';

interface DeviceSettingsPanelProps {
  device: UseDeviceResult;
  transport: DeviceTransportKind;
}

/**
 * Shown under the device panel once a device is connected — for BLE as soon
 * as it's connected, for serial only once the device has confirmed standby
 * mode (gated in App.tsx, since settings changes are meant to be made with
 * the device idle). Each field is a row of its available options with the
 * current value highlighted; picking a new one pushes an FU1/FU2 write and
 * stays in a loading state until the device's FUK reply confirms it
 * (re-picking the current value is a no-op) — see
 * agentMemory/memories/settings-write-implementation.md.
 */
const DeviceSettingsPanel = ({ device, transport }: DeviceSettingsPanelProps) => {
  const {
    bleSettings,
    serialSettings,
    blePendingSettingsField,
    serialPendingSettingsField,
    bleSettingsError,
    serialSettingsError,
    writeSettings,
  } = device;
  const settings = transport === 'ble' ? bleSettings : serialSettings;
  const pendingSettingsField = transport === 'ble' ? blePendingSettingsField : serialPendingSettingsField;
  const settingsError = transport === 'ble' ? bleSettingsError : serialSettingsError;

  return (
    <div className="ble-panel device-settings-panel">
      <div className="ble-panel-header">
        <div className="ble-panel-heading">
          <h2>Settings</h2>
        </div>
      </div>

      <div className="device-settings-grid">
        {DEVICE_SETTINGS_FIELDS.map((field) => {
          const isPending = pendingSettingsField === field.key;
          const isLocked = pendingSettingsField !== null;

          return (
            <div key={field.key} className="device-settings-field">
              <span className="device-settings-field-label">
                {field.label}
                {isPending && (
                  <span className="device-settings-spinner" role="status" aria-label="Applying…" />
                )}
              </span>
              <div className="device-settings-options" role="group" aria-label={field.label}>
                {field.options.map((option) => {
                  const isSelected = settings[field.key] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`device-settings-option${isSelected ? ' device-settings-option--selected' : ''}`}
                      aria-pressed={isSelected}
                      disabled={isLocked}
                      onClick={() => void writeSettings(transport, field.key, option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {settingsError && <p className="ble-error">{settingsError}</p>}
    </div>
  );
};

export default DeviceSettingsPanel;
