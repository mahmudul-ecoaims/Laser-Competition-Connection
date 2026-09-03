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
- [macos-bluetooth-entitlement](memories/macos-bluetooth-entitlement.md) — packaged-mac Bluetooth permission requirements
- [ble-terminal-protocol](memories/ble-terminal-protocol.md) — TAP/FUK/HCP marker convention in the message terminal
- [ble-settings-write-protocol](memories/ble-settings-write-protocol.md) — outgoing FU1/FU2 wire format for writing device settings
- [settings-write-implementation](memories/settings-write-implementation.md) — how FU1/FU2 writes were implemented: state location, defaults, currentTime assumption
- [sip-time-sync-protocol](memories/sip-time-sync-protocol.md) — outgoing SIP:01:<S|L>:hhmmsscc and INFO01 fire-and-forget commands sent generically over either transport, plus parsing INFO's IN<row> master discovery reply
- [electron-forge-native-rebuild](memories/electron-forge-native-rebuild.md) — native module rebuild is automatic
- [dev-clean-start-shutdown](memories/dev-clean-start-shutdown.md) — npm start's scripts/start-clean.mjs sweeps stray forge/vite/electron processes on both startup and Ctrl+C

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
