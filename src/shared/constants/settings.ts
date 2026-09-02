import type { DeviceSettings } from '../types/settings';

/**
 * Applied to a freshly connected device's in-memory settings state (both
 * main-process and renderer), since the device's actual current settings
 * are not read back on connect — see
 * agentMemory/memories/ble-settings-write-protocol.md.
 */
export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  brightness: 3,
  mode: 0,
  shootingArea: 0,
  shotsHeat: 5,
  secondsHeat: 30,
};

interface DeviceSettingsOption {
  value: number;
  label: string;
}

interface DeviceSettingsField {
  key: keyof DeviceSettings;
  label: string;
  /** Selectable values shown in the UI, in order. */
  options: DeviceSettingsOption[];
}

/** Plain numeric options — the option's own value doubles as its label. */
const numericOptions = (values: number[]): DeviceSettingsOption[] =>
  values.map((value) => ({ value, label: String(value) }));

/** Drives the settings option rows in DeviceSettingsPanel. */
export const DEVICE_SETTINGS_FIELDS: DeviceSettingsField[] = [
  { key: 'brightness', label: 'Brightness', options: numericOptions([1, 2, 3, 4, 5]) },
  {
    key: 'mode',
    label: 'Mode',
    options: [
      { value: 0, label: 'Competition' },
      { value: 1, label: 'Training' },
      { value: 2, label: 'OCR' },
    ],
  },
  { key: 'shootingArea', label: 'Shooting area', options: numericOptions([0, 1, 2]) },
  { key: 'shotsHeat', label: 'Shots per heat', options: numericOptions([1, 2, 3, 4, 5]) },
  {
    key: 'secondsHeat',
    label: 'Heat time limit (s)',
    options: numericOptions([10, 20, 30, 40, 50]),
  },
];
