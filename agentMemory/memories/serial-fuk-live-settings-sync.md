---
name: serial-fuk-live-settings-sync
description: Every valid incoming serial FUK updates both the terminal and live Settings state, even when no settings write is pending
tags: [serial, fuk, settings, ipc, renderer, confirmed, standard]
---

Accepted as working standard on 2026-09-03. The canonical serial wire format
and FUK field mapping are documented in [[serial-settings-write-protocol]].

Incoming serial `FUK` is live device state, not only an acknowledgement for
an app-initiated settings write. In `serialService.handleIncomingLine`, every
successfully parsed FUK now replaces `currentSettings`, publishes the shared
`device:settings-changed` event with `transport: 'serial'`, and still emits on
`fukEvents` for the existing pending-write confirmation flow.

The renderer's shared subscription routes that event to `serialSettings` and
clears any stale serial settings error. The same incoming line continues to
be published to the serial terminal before parsing. This matches the BLE
live-sync behavior in [[ble-fuk-live-settings-sync]] while retaining serial's
separate byte-stream framing and idle-flush behavior.
