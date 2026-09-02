---
name: ble-cr-only-line-endings
description: Device line endings are unreliable over BLE — most lines end in \r only, with \n arriving late on its own; MessageFramer must split on either
tags: [ble, serial, protocol, bug-fix]
---

Confirmed by direct capture (logging raw bytes at `characteristic.on('data')`
in `bleService.ts`, before the framer touches them): the device's messages
are conceptually `\r\n`-terminated, but over BLE that terminator routinely
arrives split and delayed. Most lines (e.g. consecutive `TAP` events in a
burst) show up ending in `\r` only, with no `\n` anywhere near them — the
matching `\n` shows up much later, as its own isolated 1-byte notification
packet, once enough has queued up (e.g. right after a whole `TAP` burst +
its trailing `HCP` summary). Only some messages (e.g. `FUK` heartbeats) get
lucky and receive `\r\n` together in one clean packet. This looks like
BLE's 20-byte default-MTU fragmentation interacting with something on the
device/firmware side that doesn't flush a lone trailing `\n` byte promptly.

**Symptom this caused**: `MessageFramer` (`src/electron/main/services/
messageFramer.ts`) originally split only on `\n` (stripping a trailing `\r`
from the found line). Any `\r`-only-terminated message has no `\n` to split
on, so it just kept getting concatenated into the buffer — several `TAP`
lines and an `HCP` line all glued into one blob — until the next real `\n`
eventually arrived, at which point the *entire* accumulated blob flushed as
one message. In the UI this looked like TAP messages "getting stuck" and
then all appearing at once whenever HCP showed up. Serial never hit this
(the wire reliably delivers `\r\n` together, no BLE packet-boundary
weirdness), which is why serial "worked" while BLE didn't, even though both
transports share the exact same framer/IPC/render pipeline — see
[[device-transport-abstraction]].

**Fix**: treat both `0x0d` (`\r`) and `0x0a` (`\n`) as line terminators —
split on whichever comes first, rather than only `\n`. A lone `\n` that
shows up after a `\r`-terminated line produces a zero-length segment that's
already filtered out, so this doesn't regress the clean `\r\n` case (serial,
`FUK`).

Still open (see [[ble-terminal-protocol]]): the serial baud rate default
and whether `TAP`/`FUK`/`HCP` prefix matching should be case-insensitive.
