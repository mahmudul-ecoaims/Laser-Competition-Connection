---
name: message-framing-unconfirmed
description: The newline-delimited message framing is an assumption, not confirmed with hardware — one file to change if wrong
tags: [ble, serial, protocol, open-question]
---

As of writing, nobody has confirmed how the device actually frames one
message on the wire. `MessageFramer`
(`src/electron/main/services/messageFramer.ts`) currently assumes
newline-delimited text lines (splits on `\n`, strips a trailing `\r`) — the
most common convention, and the one that makes serial (a continuous byte
stream, no natural packet boundaries) produce the same message shape as BLE
notifications (which arrive as discrete packets).

This was an explicit open question when the BLE↔serial unification was
built (see [[device-transport-abstraction]]) — the answer was "don't know
yet, figure it out later." **If you learn the real framing** (fixed-length
frames, a different delimiter, length-prefixed binary, etc.), the fix is
entirely contained to `messageFramer.ts` — both `bleService.ts` and
`serialService.ts` only call `framer.push(chunk)` and never parse bytes
themselves, specifically so this stays a one-file change.

Also unconfirmed: the serial baud rate (`DEFAULT_BAUD_RATE` in
`src/shared/constants/serial.ts` defaults to 115200, editable from the UI's
baud-rate dropdown) and whether `TAP`/`FUK`/`HCP` prefix matching (see
[[ble-terminal-protocol]]) should be case-insensitive.
