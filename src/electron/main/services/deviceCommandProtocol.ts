import type { SipSyncKind } from '../../../shared/types/commands';

/**
 * Encodes the SIP and INFO commands, and parses INFO's `IN<row>` reply —
 * see agentMemory/memories/sip-time-sync-protocol.md. Unlike the FU1/FU2
 * settings writes (deviceSettingsProtocol.ts), SIP/INFO are fire-and-forget
 * sends: nothing here blocks waiting for `IN<row>` the way writeSettings
 * blocks on FUK.
 */

/**
 * Lane/target number field, shared by SIP and INFO. Same position and
 * convention as the FU1 write's hardcoded `01` (see
 * agentMemory/memories/ble-settings-write-protocol.md) and FUK's
 * `<targetNumber>` reply field — fixed until this app supports more than
 * one lane.
 */
export const DEVICE_LANE_NUMBER = '01';

/**
 * Local clock as `hhmmsscc` — hours, minutes, seconds, centiseconds
 * (00-99), zero-padded, no separators — for the SIP command's time field.
 */
const currentTimeCentiseconds = (): string => {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');
  const centiseconds = Math.floor(now.getMilliseconds() / 10);
  return `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(centiseconds)}`;
};

/** `SIP:<lane>:<kind>:hhmmsscc` — time-sync command, `kind` being `S` or `L`. */
export const encodeSip = (kind: SipSyncKind, laneNumber: string = DEVICE_LANE_NUMBER): string =>
  `SIP:${laneNumber}:${kind}:${currentTimeCentiseconds()}`;

/** `INFO<lane>` — no colons, lane number directly appended. */
export const encodeInfo = (laneNumber: string = DEVICE_LANE_NUMBER): string => `INFO${laneNumber}`;

/** One row of INFO's `IN<rowIndex>:<value1>:<value2>:...` master discovery
 * reply — `values` is lane power/battery/status readings for that row,
 * left in wire order. */
export interface MasterDiscoveryRow {
  rowIndex: number;
  values: number[];
}

/** Matches an `IN<number>` header, with or without trailing `:...` fields —
 * the app's rule for "this is a master discovery reply" (rowIndex isn't
 * range-checked against the documented 0-9 here, only shaped). Used by
 * both `parseMasterDiscoveryRow` and the terminal's highlighting check. */
const MASTER_DISCOVERY_HEADER = /^IN(\d+)$/;

/** True for any line whose first `:`-delimited part matches `IN<number>` —
 * the recognition rule from agentMemory/memories/sip-time-sync-protocol.md,
 * exposed separately from the full parse for cheap checks (e.g. terminal
 * highlighting) that don't need the row's values. */
export const isMasterDiscoveryMessage = (text: string): boolean =>
  MASTER_DISCOVERY_HEADER.test(text.split(':')[0]?.trim() ?? '');

/**
 * Parses an `IN<rowIndex>:<value1>:<value2>:...` reply to INFO. Returns
 * null for anything whose header doesn't match `IN<number>`. Each value
 * field is parsed as a number; non-numeric/invalid fields normalize to
 * `-1` per the documented format (already the device's own sentinel for
 * "no reading", e.g. `IN1:100:93:-1:84`).
 */
export const parseMasterDiscoveryRow = (text: string): MasterDiscoveryRow | null => {
  const parts = text.split(':').map((part) => part.trim());
  const header = MASTER_DISCOVERY_HEADER.exec(parts[0] ?? '');
  if (!header) return null;

  const values = parts.slice(1).map((part) => {
    if (part.length === 0) return -1;
    const value = Number(part);
    return Number.isFinite(value) ? value : -1;
  });

  return { rowIndex: Number(header[1]), values };
};
