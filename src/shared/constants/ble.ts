/**
 * BLE identifiers for the laser-competition target device.
 *
 * Mirrors GLOBALS.SERVICE from the React Native app
 * (docs/constants/index.ts) so the desktop app talks to the same
 * GATT service/characteristics on the hardware.
 */

const stripUuid = (uuid: string) => uuid.replace(/-/g, '').toLowerCase();

export const BLE_UUIDS = {
  /** GATT service advertised by the target device. */
  SERVICE: stripUuid('0bd51666-e7cb-469b-8e4d-2742f1ba77cc'),
  /** Write commands to the device (fire, arm, etc.). */
  COMMAND_CHARACTERISTIC: stripUuid('e7add780-b042-4876-aae1-11285535f821'),
  /** Read/write device settings. */
  SETTINGS_CHARACTERISTIC: stripUuid('e7add780-b042-4876-aae1-11285535f721'),
} as const;

/** How long noble is allowed to scan before giving up, in ms. */
export const BLE_SCAN_TIMEOUT_MS = 15_000;
