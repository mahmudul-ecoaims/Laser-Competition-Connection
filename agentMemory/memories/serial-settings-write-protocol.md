---
name: serial-settings-write-protocol
description: Accepted serial settings standard: one CRLF-terminated FUK line for writes and the shared FUK format for reads
tags: [serial, protocol, settings, fuk, confirmed, standard]
---

## Status

This is the accepted, hardware-working serial settings protocol as of
2026-09-03. It comes from the device specification's "3.3 Target
Configuration (Standby Only)" format and is the standard to preserve.

## Serial settings write

Serial does **not** use BLE's FU1/FU2 pair. Send one ASCII line shaped like
FUK and terminate it with `\r\n`:

```
FUK:01:0<brightness>:00:<mode>:0<shootingArea>:0<shotsHeat>:<secondsHeat>:0000000\r\n
```

Example for brightness 3, Competition mode, shooting area 2, five shots,
and 40 seconds:

```
FUK:01:03:00:0:02:05:40:0000000\r\n
```

- `01`: fixed target/lane number.
- `0<brightness>`: brightness `01`-`05`.
- `00`: fixed battery placeholder; battery is read-only.
- `<mode>`: `0` Competition, `1` Training, `2` OCR; unpadded.
- `0<shootingArea>`: `00`-`02`.
- `0<shotsHeat>`: `01`-`05`.
- `<secondsHeat>`: one of `10`, `20`, `30`, `40`, `50`.
- `0000000`: fixed seven-zero timestamp placeholder.

The app writes the complete CRLF-terminated line, drains the serial port,
then waits up to 10 seconds for an incoming FUK confirmation. The write is
Standby-only: in Live mode the device may silently ignore it. The renderer
therefore exposes Settings only after serial SIP state is `S`.

The serial wire shape is confirmed working. Historically the hardware test
explicitly exercised brightness, shooting area, shots, and duration; mode
values other than `0` were not separately isolated in that test.

## Serial FUK read

Incoming serial FUK uses the same field order as the outgoing line and the
same parser/state mapping as BLE:

```
FUK:<targetNumber>:<brightness>:<battery>:<mode>:<shootingArea>:<shotsHeat>:<secondsHeat>:<timestamp>
```

The parser stores brightness, mode, shooting area, shots per heat, and heat
seconds. Target number, battery, and timestamp remain available in the raw
terminal line but are not stored in `DeviceSettings`.

Serial bytes are framed on either `\r` or `\n`. If the final reply has no
terminator, the serial-only 200 ms idle flush releases the buffered line for
parsing. Every valid incoming serial FUK—periodic, unsolicited, or write
confirmation—must both remain visible in the serial terminal and immediately
replace the serial Settings state. See [[serial-fuk-live-settings-sync]] and
[[settings-write-implementation]].

Do not restore the rejected FU1/FU2-over-serial implementation: real hardware
ignored it completely. BLE FU1/FU2 and serial FUK are intentionally different
write protocols, not merely different framing.
