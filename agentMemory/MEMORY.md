# Project Memory Index

One line per memory file in [`memories/`](memories/). Read this index first;
open only the files relevant to your current task — don't read the whole
folder for a small change. See [`PROJECT.md`](PROJECT.md) for the fuller
architecture/context reference.

- [ble-target-uuids](memories/ble-target-uuids.md) — GATT service/characteristic UUIDs for the target device
- [ble-architecture-decision](memories/ble-architecture-decision.md) — why noble-in-main-process over Web Bluetooth
- [device-transport-abstraction](memories/device-transport-abstraction.md) — BLE and serial are two switchable transports unified behind deviceManager
- [serial-transport](memories/serial-transport.md) — serialport package, native-module handling, baud rate
- [message-framing-unconfirmed](memories/message-framing-unconfirmed.md) — newline framing is a guess, not confirmed — read before touching parsing
- [noble-vite-bundling-bug](memories/noble-vite-bundling-bug.md) — Vite/Rollup bundling bug + fix, don't undo it
- [macos-bluetooth-entitlement](memories/macos-bluetooth-entitlement.md) — packaged-mac Bluetooth permission requirements
- [ble-terminal-protocol](memories/ble-terminal-protocol.md) — TAP/FUK/HCP marker convention in the message terminal
- [electron-forge-native-rebuild](memories/electron-forge-native-rebuild.md) — native module rebuild is automatic

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
