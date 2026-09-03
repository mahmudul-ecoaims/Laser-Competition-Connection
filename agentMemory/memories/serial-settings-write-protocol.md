---
name: serial-settings-write-protocol
description: Serial's settings write is a different wire format from BLE's FU1/FU2 — a single FUK:... line, device-supplied spec, Standby-mode only — confirmed working on real hardware 2026-09-03
tags: [serial, protocol, settings, confirmed]
---

Settings writes over serial do **not** use BLE's FU1/FU2 pair (see
[[ble-settings-write-protocol]]) — that was an incorrect assumption made
when `serialService.writeSettings` was first implemented (mirroring BLE
verbatim), and produced total silence from real hardware (no FUK reply,
not even a malformed one) no matter what framing/timing was tried around
it. The device-supplied spec ("3.3 Target Configuration (Standby Only)")
gives the actual serial protocol — **confirmed working against real
hardware** on 2026-09-03, replacing the FU1/FU2 attempt entirely: a single
line, shaped like the `FUK` confirmation reply itself:

```
FUK:01:AA:BB:C:DD:EE:FF:0000000
```

- `01`: target/lane number, fixed, same value as FU1's.
- `AA` (brightness 1-5): `0<brightness>`. Confirmed working.
- `BB`: always `00` — battery is read-only, this is a placeholder mirroring
  the reply's battery position.
- `C` (mode): single digit, unpadded. Every example in the spec keeps this
  `0` (none of them demonstrate a mode change) but it sits in the same
  position FU1's `<mode>` field does — assumed settable the same way, but
  **still unconfirmed** for values other than `0`: the hardware test that
  confirmed this protocol changed brightness/area/shots/duration, not mode.
- `DD` (shootingArea 0-2): `0<shootingArea>`. Confirmed working.
- `EE` (shotsHeat 1-5): `0<shotsHeat>`. Confirmed working.
- `FF` (secondsHeat): literal two-digit value, one of `[10,20,30,40,50]` —
  no padding needed. Confirmed working.
- `0000000`: fixed 7-zero placeholder, mirrors the reply's timestamp
  position — sent literally, never computed.

Implemented as `encodeFukWrite` in `deviceSettingsProtocol.ts`, used only by
`serialService.writeSettings` (BLE keeps using `encodeFu1`/`encodeFu2`
unchanged — the two transports now have genuinely different write
protocols, not just different framing). Still terminated with `\r\n` and
drained like any other serial line (see [[sip-time-sync-protocol]]) since
it's one line, not two — the earlier two-line-with-a-settle-delay attempt
was removed once the real one-line protocol was confirmed.

**Standby-only**: per the spec, the device only responds to (or applies)
this write in Standby mode — in Live mode it's silently ignored, no reply
at all, indistinguishable from a dead connection. `serialService` doesn't
enforce this itself; the renderer gate (`showSettings` in `App.tsx`) is
what's relied on to only offer the settings panel once standby is confirmed.
That same UI rule applies to BLE too: settings are hidden until the visible
transport's SIP state is `S` (`bleSipMode === 'S'` or
`serialSipMode === 'S'`; see [[sip-time-sync-protocol]]).

**What actually fixed it vs. what didn't:** two earlier things were tried
first and neither resolved the timeout on their own — a settle delay
between two writes (moot now, there's only one write) and an idle-flush
fix in `MessageFramer` for replies that never get their own terminator.
Both were plausible given the symptom (total silence, not a malformed
reply) but the real cause was simply the wrong command format — the device
never recognized FU1/FU2 as serial commands at all, so there was nothing
for either fix to catch. The idle-flush addition (`MessageFramer.flush()`
+ `IDLE_FLUSH_MS`/200ms idle timer in `serialService`, scoped to serial only
— `bleService` never calls `flush()`, so BLE's fragmentation handling, see
[[ble-cr-only-line-endings]], is untouched) was left in as genuine
robustness for a still-plausible future case (some other reply that really
is the last thing sent with no terminator), but wasn't exercised by this
bug and isn't confirmed to ever trigger in practice.
