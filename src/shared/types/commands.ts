/**
 * Types for the on-demand SIP/INFO commands — see
 * agentMemory/memories/sip-time-sync-protocol.md. Encoding lives in
 * `src/electron/main/services/deviceCommandProtocol.ts`; this type is
 * shared because it also crosses the IPC boundary
 * (`window.electronAPI.device.writeSip`).
 */

/** `S` and `L` are fixed single-letter literals in the `SIP:<lane>:<kind>:hhmmsscc`
 * wire format; meaning not documented elsewhere. */
export type SipSyncKind = 'S' | 'L';
