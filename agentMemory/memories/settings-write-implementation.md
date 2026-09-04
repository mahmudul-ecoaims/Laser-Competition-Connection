---
name: settings-write-implementation
description: Standard BLE/serial settings implementation: transport-specific writes, shared FUK parsing, confirmation, and live state synchronization
tags: [ble, serial, protocol, settings, fuk, ipc, ui, confirmed, standard]
---

## Status and ownership

Accepted as the working desktop implementation standard on 2026-09-03.
Preserve the current transport formats unless a later firmware change is
confirmed. Canonical wire details live in [[ble-settings-write-protocol]] and
[[serial-settings-write-protocol]].

`deviceSettingsProtocol.ts` owns `encodeFu1`, `encodeFu2`, `encodeFukWrite`,
and the one shared `parseFukMessage` function. `bleService.ts` and
`serialService.ts` own their transport framing. `deviceManager.ts`, the
preload bridge, and `useDevice.ts` carry parsed settings to React without
giving the renderer Node, Electron, BLE, or serial access.

## Transport write flow

Both services keep their own independent `currentSettings` and expose the
same `writeSettings(partial): Promise<DeviceSettings>` contract:

1. Merge the requested partial into that transport's latest settings.
2. If no value changed, return immediately without writing.
3. BLE sends its two unterminated FU1/FU2 GATT writes. Serial sends its one
   CRLF-terminated FUK line and drains the port.
4. Wait up to `SETTINGS_CONFIRMATION_TIMEOUT_MS` (10 seconds) for the next
   valid incoming FUK on that same transport.
5. Resolve with the device-reported FUK values, not merely the requested
   values. Timeout or disconnect rejects the promise.

Only one settings field is written at a time per transport. The renderer
shows Settings only after that transport has confirmed Standby mode through
SIP (`S`), because settings writes outside Standby may be ignored.

## Every-FUK read and state flow

For both BLE and serial, every complete incoming line is first published as
an incoming `DeviceMessage`, so FUK always remains visible in the correct
transport terminal. The service then calls the shared `parseFukMessage`.

Every successfully parsed FUK, whether periodic, unsolicited, or a write
confirmation, performs all of these actions:

1. Replace that service's `currentSettings` with the device-reported values.
2. Publish typed `DeviceSettingsEvent { transport, settings }` through
   `device:settings-changed`.
3. Let `useDevice` replace only the matching `bleSettings` or
   `serialSettings` state and clear that transport's stale settings error.
4. Emit on that service's `fukEvents`, preserving the pending-write
   confirmation flow.

BLE and serial state never overwrite each other. See
[[ble-fuk-live-settings-sync]] and [[serial-fuk-live-settings-sync]].

## Renderer behavior

`useDevice.writeSettings(transport, key, value)` skips a value already equal
to the latest state. Otherwise it marks that transport's field pending,
disables its settings options until the promise settles, and surfaces a
timeout/disconnect error without applying the unconfirmed requested value.
The independent every-FUK event path can still update the displayed actual
settings whenever the device reports them.

All outgoing settings writes are also published as `DeviceMessage` entries
with `direction: 'out'`, so the terminal shows BLE FU1/FU2 or serial FUK with
the red outgoing marker. Incoming TAP/FUK/HCP lines retain the green marker;
see [[ble-terminal-protocol]].

## Important boundaries

- Neither transport sends a dedicated settings-read request on connect.
  `DEFAULT_DEVICE_SETTINGS` seeds main and renderer state until the first
  valid FUK arrives.
- FUK has no correlation identifier. While a settings write is pending, the
  next valid FUK on that transport resolves it; every FUK still updates live
  state regardless of whether a write is pending.
- The canonical device FUK includes the timestamp field. The current parser
  requires fields through `secondsHeat`, requires all five stored settings to
  be finite numbers, tolerates an absent/extra timestamp because it is ignored,
  and does not range-check numeric values.
- BLE is self-framed per GATT write and incoming lines split on `\r` or `\n`.
  Serial commands require `\r\n`; serial reads also have a 200 ms idle flush
  for a final unterminated line.
- The accepted mode mapping is `0` Competition, `1` Training, `2` OCR. BLE
  FU2 uses the desktop app's current local 24-hour `HH:mm` representation.
