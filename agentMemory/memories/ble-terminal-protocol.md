---
name: ble-terminal-protocol
description: Incoming message terminal marks TAP/FUK/HCP-prefixed lines with a green "-->", others get a blank marker
tags: [ble, serial, ui, protocol]
---

`src/renderer/features/device/DeviceTerminal.tsx` renders one line per
`DeviceMessage` (UTF-8 text, decoded in `messageFramer.ts` — see
[[device-transport-abstraction]]), regardless of whether it arrived over
BLE or serial. Always visible:

- Lines starting with `TAP`, `FUK`, or `HCP` get a green `-->` marker — these
  are the three known message-type prefixes from the device firmware.
- Everything else gets a blank `   ` (three-space) marker instead of being
  hidden, so the total message count/order stays visible even for
  unrecognized lines.

Matching is case-sensitive (`startsWith`) — confirm with the hardware team
whether the device ever sends lowercase variants before assuming this is
complete (see [[message-framing-unconfirmed]]). See [[ble-target-uuids]] for
which BLE characteristic these messages come from when on that transport.
