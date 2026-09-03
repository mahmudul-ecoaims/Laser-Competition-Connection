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
 * Serial's settings write is a *different* protocol from BLE's FU1/FU2 pair
 * above — a single line, shaped like the FUK confirmation reply itself
 * (device-supplied spec, "3.3 Target Configuration (Standby Only)").
 * Confirmed working against real hardware:
 *
 * ```
 * FUK:01:AA:BB:C:DD:EE:FF:0000000
 * ```
 *
 * - `01`: target/lane number, same fixed value as FU1.
 * - `AA` (brightness, 1-5): `0<brightness>`, e.g. `03`. Confirmed.
 * - `BB`: always `00` on write — battery is read-only, this field is a
 *   placeholder mirroring the reply's battery position.
 * - `C` (mode): single digit, unpadded — every example in the spec keeps
 *   this `0` since none of them are demonstrating a mode change, but it
 *   occupies the same position FU1's `<mode>` field does, so it's assumed
 *   settable the same way. Still unconfirmed for values other than `0` —
 *   the hardware test that confirmed this protocol changed
 *   brightness/area/shots/duration, not mode.
 * - `DD` (shootingArea, 0-2): `0<shootingArea>`, e.g. `01`. Confirmed.
 * - `EE` (shotsHeat, 1-5): `0<shotsHeat>`, e.g. `05`. Confirmed.
 * - `FF` (secondsHeat): the literal two-digit value, one of
 *   `[10,20,30,40,50]` — no padding needed, e.g. `40`. Confirmed.
 * - `0000000`: fixed 7-zero placeholder, mirroring the reply's timestamp
 *   position — always sent literally, never computed.
 *
 * Per the spec, the device only responds to (or applies) this command in
 * Standby mode; in Live mode it's silently ignored — no reply at all, which
 * looks identical to a dead/misconfigured connection from this app's side.
 * See agentMemory/memories/serial-settings-write-protocol.md.
 */
export const encodeFukWrite = (settings: DeviceSettings): string =>
  `FUK:01:0${settings.brightness}:00:${settings.mode}:0${settings.shootingArea}:0${settings.shotsHeat}:${settings.secondsHeat}:0000000`;

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
