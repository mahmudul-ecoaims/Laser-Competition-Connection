import type { DeviceSettings } from '../../../shared/types/settings';

/**
 * Encodes/decodes the FU1/FU2/FUK settings protocol — see
 * agentMemory/memories/ble-settings-write-protocol.md. FU1/FU2 are the
 * outgoing writes; FUK is the device's echo of its *actual* current
 * settings, confirming they took effect. Parsed the same way as the RN
 * reference's `_toObject.FUK` (docs/constants/BleHelper.js), which is
 * dispatched to `Settings/TARGET_SETTINGS` there — i.e. FUK is the
 * confirmation reply for an FU1/FU2 write.
 */

/** How long a write waits for the device's FUK confirmation before giving
 * up. Matches the RN reference's 10s guard around the FU1/FU2 writes
 * themselves (see the memory above) — reused here for the wait-for-echo
 * step, which the RN app doesn't actually do (it fires and forgets). */
export const SETTINGS_CONFIRMATION_TIMEOUT_MS = 10_000;

/**
 * Local 24h clock as HH:mm for the FU2 `<currentTime>` field. The RN
 * reference (docs/constants/deviceSettings.ts) calls an unported
 * `getCurrentTime()` here with no documented format — this is an
 * assumption, see agentMemory/memories/ble-settings-write-protocol.md.
 */
const currentTimeString = (): string => {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

export const encodeFu1 = (settings: DeviceSettings): string =>
  `FU1:01:0${settings.brightness}:00:${settings.mode}:0${settings.shootingArea}`;

export const encodeFu2 = (settings: DeviceSettings): string =>
  `FU2:0${settings.shotsHeat}:${settings.secondsHeat}:${currentTimeString()}`;

/**
 * FUK wire format: `FUK:<targetNumber>:<brightness>:<battery>:<mode>:
 * <shootingArea>:<shotsHeat>:<secondsHeat>:<timestamp>`. Returns null for
 * anything that isn't a well-formed FUK line (wrong prefix, too few
 * fields, non-numeric fields).
 */
export const parseFukMessage = (text: string): DeviceSettings | null => {
  const parts = text
    .split(':')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts[0] !== 'FUK' || parts.length < 8) return null;

  const settings: DeviceSettings = {
    brightness: Number(parts[2]),
    mode: Number(parts[4]),
    shootingArea: Number(parts[5]),
    shotsHeat: Number(parts[6]),
    secondsHeat: Number(parts[7]),
  };

  const isValid = Object.values(settings).every((value) => Number.isFinite(value));
  return isValid ? settings : null;
};
