---
name: settings-write-implementation
description: How the FU1/FU2 write + FUK confirmation loop was implemented — where each step lives, the wait/timeout, and remaining assumptions
tags: [ble, protocol, settings, ui]
---

Implements the wire format from [[ble-settings-write-protocol]], including
waiting for the device's `FUK` confirmation reply. Encoding/decoding lives
in `src/electron/main/services/deviceSettingsProtocol.ts`
(`encodeFu1`/`encodeFu2`/`parseFukMessage`), kept separate from
`bleService.ts` for testability.

**Write flow (`bleService.writeSettings`, returns `Promise<DeviceSettings>`
now, not `void`):**

1. Merge the requested partial onto `currentSettings`; if nothing actually
   changed, return `currentSettings` immediately — no write.
2. Otherwise write FU1 then FU2 (each also published as an outgoing
   `DeviceMessage`, see below).
3. Wait on an internal `fukEvents` `EventEmitter` for the next parsed `FUK`
   message, up to `SETTINGS_CONFIRMATION_TIMEOUT_MS` (10s, reusing the RN
   app's write-timeout duration for a wait it doesn't actually do — the RN
   app fires FU1/FU2 and moves on, it doesn't block on FUK).
4. On confirmation, `currentSettings` becomes the *FUK-parsed* values (not
   what was requested) and that's what's returned/resolved. On timeout, or
   if the device disconnects mid-wait (the peripheral `disconnect` handler
   emits a null `fuk` to unstick the wait), the promise rejects instead of
   resolving with unconfirmed data.
5. Every incoming message is checked for a `FUK` prefix and fed into
   `fukEvents` regardless of which characteristic it arrived on (command or
   settings) — see [[ble-settings-write-protocol]] for why command is the
   one that actually matters. There's no correlation id, so an unrelated
   spontaneous FUK would also resolve a pending write; not handled, no
   evidence yet that the device sends unsolicited ones.

**Renderer (`useDevice.ts`):** `writeSettings(key, value)` skips the IPC
call entirely if `value` already equals `settings[key]` (no loading shown).
Otherwise it sets `pendingSettingsField` (disables every option button
across the whole panel — only one field writes at a time, matching the
single BLE write in flight) and only calls `setSettings(...)` with the
value the main process returns, once the awaited call resolves. A
rejection (timeout/disconnect) is caught into `settingsError` and shown
under the panel (`ble-error` styling); `settings` stays unchanged in that
case. Both `pendingSettingsField` and `settingsError` reset on a fresh
`connectBle()`.

**Still assumed, not confirmed against firmware:**

- `DEFAULT_DEVICE_SETTINGS` (`src/shared/constants/settings.ts`) seeds
  `currentSettings`/`settings` on connect — still not read from the device
  until the first successful write's FUK reply arrives. No explicit
  "read current settings" request is sent on connect.
- FU2's `currentTime` field is still assumed `HH:mm` 24h local clock
  (`currentTimeString()` in `deviceSettingsProtocol.ts`) — unconfirmed, see
  [[ble-settings-write-protocol]].
- Mode option labels (`DEVICE_SETTINGS_FIELDS` in
  `src/shared/constants/settings.ts`) — `0: Competition`, `1: Training`,
  `2: OCR` (user-supplied mapping) — are UI-only labels for the field's
  numeric wire values; not derived from firmware docs.

Every FU1/FU2 write is published as an outgoing `DeviceMessage`
(`direction: 'out'`, new field on `DeviceMessage` — existing incoming
messages are `direction: 'in'`) so `DeviceTerminal.tsx` shows it. Outgoing
messages always get a red `-->` marker (`ble-terminal-marker--out`),
regardless of prefix — separate from the existing green marker for
incoming `TAP`/`FUK`/`HCP` lines (see [[ble-terminal-protocol]]).
