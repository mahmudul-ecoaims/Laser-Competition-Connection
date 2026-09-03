---
name: ble-fuk-live-settings-sync
description: Every valid incoming BLE FUK updates both the terminal and live Settings state, even when no settings write is pending
tags: [ble, fuk, settings, ipc, renderer]
---

Incoming BLE `FUK` is live device state, not only an acknowledgement for an
app-initiated settings write. In `bleService`, every successfully parsed FUK
now replaces `currentSettings`, publishes a `device:settings-changed` event,
and still emits on `fukEvents` for the existing pending-write confirmation
flow. The renderer's `useDevice` subscription applies that event to
`bleSettings`, so unsolicited/periodic FUK messages update the visible
Settings panel and clear any stale settings error, as well as continuing to
appear in the terminal.

Keep parsing in the main process: the renderer receives typed
`DeviceSettingsEvent` data through the preload bridge and does not duplicate
the FUK wire parser. There is still no explicit settings-read command on BLE
connect; defaults remain until the first valid incoming FUK arrives.
