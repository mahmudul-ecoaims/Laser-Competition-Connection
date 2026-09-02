---
name: ble-settings-write-protocol
description: Outgoing FU1/FU2 wire format for writing brightness/mode/timer/area/shots to the target over the Settings characteristic
tags: [ble, protocol, settings]
---

The companion React Native app's `deviceSettings()` (not yet ported to this
Electron app — reference copy at
[`docs/constants/deviceSettings.ts`](../../docs/constants/deviceSettings.ts))
pushes device settings as two colon-delimited ASCII writes to the Settings
characteristic (`GLOBALS.SERVICE.SETTINGS`, see [[ble-target-uuids]]):

```
FU1:01:0<brightness>:00:<mode>:0<shootingArea>
FU2:0<shotsHeat>:<secondsHeat>:<currentTime>
```

- `brightness`: 1-5
- `mode`: 0, 1, or 2
- `shootingArea`: 0, 1, or 2
- `shotsHeat` (max shot hits per heat): 1-5
- `secondsHeat` (time limit): 10-50

Both writes go out back-to-back under one 10s timeout guard; if none of the
five values actually changed vs. current app state, nothing is written at
all (diffed against in-memory state, not re-sent unconditionally).

This is the write side of the settings round-trip — the device echoes
current settings back via an incoming `FUK` message, parsed by
`_toObject.FUK` in `docs/constants/BleHelper.js` (see
[[ble-terminal-protocol]]). `FU1`/`FU2` are not among the `TAP`/`FUK`/`HCP`
prefixes that terminal marks with `-->` — if these writes are echoed or
acked, confirm what prefix that reply uses before assuming it's silently
dropped.
