# Project Memory Index

One line per memory file in [`memories/`](memories/). Read this index first;
open only the files relevant to your current task — don't read the whole
folder for a small change. See [`PROJECT.md`](PROJECT.md) for the fuller
architecture/context reference.

- [ble-target-uuids](memories/ble-target-uuids.md) — GATT service/characteristic UUIDs for the target device
- [ble-architecture-decision](memories/ble-architecture-decision.md) — why noble-in-main-process over Web Bluetooth
- [device-transport-abstraction](memories/device-transport-abstraction.md) — BLE and serial are two independent transports, connectable at the same time, unified behind deviceManager
- [serial-transport](memories/serial-transport.md) — serialport package, native-module handling, baud rate
- [serial-port-info-fields](memories/serial-port-info-fields.md) — all 7 SerialPortInfo fields, reliability, and the "More info" modal that shows them
- [ble-cr-only-line-endings](memories/ble-cr-only-line-endings.md) — BLE lines often end in bare \r with \n arriving late; framer splits on either
- [noble-vite-bundling-bug](memories/noble-vite-bundling-bug.md) — Vite/Rollup bundling bug + fix, don't undo it
- [noble-windows-fork-migration](memories/noble-windows-fork-migration.md) — switched @abandonware/noble → @stoprocent/noble; abandonware's Windows-only path (WinUSB/HCI-socket) breaks the OS Bluetooth stack
- [noble-mac-connect-hang-fix](memories/noble-mac-connect-hang-fix.md) — @stoprocent/noble's mac binding silently hangs connect() for peripherals macOS has no prior bonding with; patched via patch-package
- [noble-windows-connect-unreliable](memories/noble-windows-connect-unreliable.md) — **RESOLVED, confirmed on real LT700_40 hardware**: two bugs — `@stoprocent/noble`'s Windows binding silently swallowed real GATT write/notify failures, and `bleService.ts` never paired on Windows; pairing itself needed the plain `DeviceInformationPairing.PairAsync` instead of Custom pairing (which hit `RequiredHandlerNotRegistered`) — full trail + Windows-only scoping (mac unaffected) in the file
- [macos-bluetooth-entitlement](memories/macos-bluetooth-entitlement.md) — packaged-mac Bluetooth permission requirements
- [ble-terminal-protocol](memories/ble-terminal-protocol.md) — TAP/FUK/HCP marker convention in the message terminal
- [ble-settings-write-protocol](memories/ble-settings-write-protocol.md) — accepted BLE standard: unterminated FU1/FU2 writes plus shared incoming FUK field/state mapping
- [settings-write-implementation](memories/settings-write-implementation.md) — BLE/serial settings write confirmation and every-FUK state synchronization implementation
- [sip-time-sync-protocol](memories/sip-time-sync-protocol.md) — outgoing SIP:01:<S|L>:hhmmsscc and INFO01 fire-and-forget commands; BLE variant was silently going to the wrong (Command, not Settings) characteristic — fixed via new writeGenericCommand, confirmed working on hardware; plus parsing INFO's IN<row> master discovery reply
- [serial-settings-write-protocol](memories/serial-settings-write-protocol.md) — accepted serial standard: one CRLF-terminated FUK settings line, Standby-only, plus shared incoming FUK mapping
- [ble-fuk-live-settings-sync](memories/ble-fuk-live-settings-sync.md) — every valid incoming BLE FUK updates both the terminal and live Settings state, including unsolicited messages
- [serial-fuk-live-settings-sync](memories/serial-fuk-live-settings-sync.md) — every valid incoming serial FUK updates both the terminal and live Settings state, including unsolicited messages
- [electron-forge-native-rebuild](memories/electron-forge-native-rebuild.md) — native module rebuild is automatic
- [dev-clean-start-shutdown](memories/dev-clean-start-shutdown.md) — npm start's scripts/start-clean.mjs sweeps stray forge/vite/electron processes on Ctrl+C only (not on startup)
- [ble-scan-name-needs-duplicates](memories/ble-scan-name-needs-duplicates.md) — RESOLVED: in-app BLE scan list showed LT700_40 as "Unknown device" (allowDuplicates false + Windows binding dropped scan-response packets for already-matched devices); also fixed the resulting list-reorders-by-RSSI UX issue by sorting by name instead

## Adding a new memory

One fact per file, in `memories/`, with this frontmatter:

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary, used to decide relevance>
tags: [comma, separated, topics]
---

<the fact. For a bug: symptom, root cause, fix. For a decision: what was
chosen, what it costs, why. Link related memories with [[other-name]].>
```

Then add one line to the index above. Only add what isn't already obvious
from the code or git history — this file is for context an agent can't
derive by reading the repo.
