---
name: sip-time-sync-protocol
description: Outgoing SIP:<lane>:<S|L>:hhmmsscc and INFO<lane> commands, sent on demand over whichever transport is active
tags: [ble, serial, protocol, command]
---

`SIP:<lane>:<kind>:hhmmsscc` and `INFO<lane>` are user-supplied wire
commands (not from the RN reference app, unlike FU1/FU2/FUK — see
[[ble-settings-write-protocol]]). Encoded by `encodeSip`/`encodeInfo` in
`src/electron/main/services/deviceCommandProtocol.ts`:

- `<lane>`: two-digit lane/target number, hardcoded to `"01"`
  (`DEVICE_LANE_NUMBER`, shared by both commands) — same position/
  convention as the FU1 write's hardcoded `01` and FUK's `<targetNumber>`
  reply field. Not yet configurable; revisit when this app supports more
  than one lane.
- `<kind>` (SIP only): `S` or `L` (`SipSyncKind`, `src/shared/types/commands.ts`)
  — fixed single-letter literals in the wire format, meaning not
  documented elsewhere. Two separate buttons in the UI send one each.
- `hhmmsscc` (SIP only): local system clock at send time, zero-padded
  hours/minutes/seconds + centiseconds (00-99), no separators, 8 digits
  total. Computed fresh on each send, not cached.
- `INFO<lane>`: no colons, lane number directly appended (`INFO01`) — no
  other fields.

Unlike [[settings-write-implementation]]'s FU1/FU2 (which wait on a `FUK`
confirmation reply), both SIP and INFO are fire-and-forget by design — no
reply is parsed or awaited for either.

**Where it lives:** `deviceManager.writeSip(kind)` / `deviceManager.writeInfo()`
(not `bleService`/`serialService`) — both go through a shared private
`writeLine()` that calls the active transport's generic `write()` and
publishes the outgoing line as a `DeviceMessage` (`source: 'command'`,
`direction: 'out'`), the same generic path `device:write-command` already
used (see [[device-transport-abstraction]]). This works identically over
BLE or serial with no transport-specific code, because neither command
needs characteristic-specific handling the way BLE settings writes do.
Exposed as IPC channels `device:write-sip` (takes a `SipSyncKind` arg) and
`device:write-info` / `window.electronAPI.device.writeSip(kind)` and
`.writeInfo()`, triggered from "Sync time (SIP S)", "Sync time (SIP L)",
and "Request info (INFO01)" buttons in `DevicePanel.tsx`, shown whenever a
device is connected, regardless of mode.

**Serial needs a `\r\n` terminator, BLE doesn't:** a bare `INFO01`/`SIP:...`
write over serial produced no `IN<row>` reply at all — a BLE characteristic
write is self-framed (one write = one complete message), but a serial line
is a continuous byte stream, so the firmware needs an explicit terminator
to know a command is finished. `deviceManager.writeLine` (private, backs
both `writeSip`/`writeInfo`) now appends `\r\n` only when
`this.active.kind === 'serial'`; BLE stays unterminated, matching the RN
reference's FU1/FU2 writes (see [[ble-settings-write-protocol]]) since
that path isn't reported broken. If BLE SIP/INFO turns out to need a
terminator too, this is the one place to change it. The published
`DeviceMessage.text` for these writes is still the undecorated line (no
`\r\n`) for readable terminal display; `.hex` reflects the real
terminated wire bytes.

**The device does reply to SIP, just unparsed on the main-process side:**
despite "fire-and-forget... no reply is parsed or awaited" above (still true
of `deviceManager`/`deviceCommandProtocol.ts`), the device echoes the SIP
command back with an extra field, e.g. sending `SIP:01:L:08263283` produces
an incoming `SIP:01:L:08263283:11714` — same shape as the outgoing line plus
one more `:`-delimited value whose meaning isn't confirmed (a device-side
tick/ack counter is suspected, not verified). `DeviceTerminal.tsx` gives
these (and `IN<row>`) their own bold green down arrow (`⬇`, distinct from
the plain green `-->` TAP/FUK/HCP get) via `isDownArrowReply`, since neither
is a request/response pair the app parses the way FUK is.

**SIP mode UI state (`sipMode` in `useDevice.ts`):** tracks which sync kind
(`S`/`L`) the device last *confirmed* via that reply — not set optimistically
on send, only when a matching `SIP:<lane>:<kind>:...` reply actually arrives
(`parseSipReplyKind`, regex-reparsed in the renderer since
`deviceCommandProtocol.ts` lives under `electron/main` and isn't importable
there — same reason `DeviceTerminal.tsx` duplicates `MASTER_DISCOVERY_PREFIX`
instead of importing `isMasterDiscoveryMessage`). Starts `null` (both
"Sync time (SIP S/L)" buttons unselected); a reply for one kind sets
`sipMode` to it, which both marks that button active (`sip-mode-button--active`
class, teal-selected style matching `device-settings-option--selected`) and
implicitly deactivates the other, since only one value is stored. Reset to
`null` on `connectBle`/`connectSerial` alongside `messages`/`settings`, since
a fresh connection has no confirmed mode yet.

**INFO's reply — `IN<rowIndex>:<value1>:<value2>:...`:** e.g.
`IN0:95:88:91:70`, `IN1:100:93:-1:84`. `rowIndex` is documented as 0-9;
`values` are lane power/battery/status readings for that row, left in wire
order, with non-numeric/invalid fields normalized to `-1` (the device's
own sentinel for "no reading" — already appears in real replies, e.g.
`IN1`'s third value above). Parsed by `parseMasterDiscoveryRow` in
`deviceCommandProtocol.ts`; `isMasterDiscoveryMessage` is a cheaper
header-only check (`IN<number>` as the first `:`-delimited part, not
range-checked against 0-9) reused by `DeviceTerminal.tsx` to give these
lines the same green "known message" highlighting as `TAP`/`FUK`/`HCP`
(can't be a fixed `KNOWN_PREFIXES` string there since the row number
varies). As of this writing the parser is recognize-and-highlight only —
nothing stores or displays the parsed rows yet (deliberately deferred, not
an oversight); wire it into state if/when a discovery-table UI is wanted.
