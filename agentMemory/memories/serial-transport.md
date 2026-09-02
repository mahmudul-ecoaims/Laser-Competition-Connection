---
name: serial-transport
description: serialport is the second (USB/serial) transport to the target device; same native-module handling as noble
tags: [serial, build]
---

`serialService.ts` uses the `serialport` npm package (native addon via
`@serialport/bindings-cpp`, ships prebuilds for mac/win/linux — no local
build toolchain needed). It hits the exact same class of issue as
[[noble-vite-bundling-bug]], so both `serialport` and
`@serialport/bindings-cpp` are marked external in `vite.main.config.ts`
alongside `@abandonware/noble` — don't remove that.

Port discovery is a plain one-shot `SerialPort.list()` call (exposed via the
`serial:list-ports` IPC channel, invoked from the UI's "Refresh ports"
button) — unlike BLE there's no continuous "scanning" state for serial.

Default baud rate is 115200 (`DEFAULT_BAUD_RATE` in
`src/shared/constants/serial.ts`) — not confirmed with hardware, see
[[message-framing-unconfirmed]]. The UI exposes a baud-rate dropdown
(`COMMON_BAUD_RATES`) so this doesn't need a code change to test other
rates.
