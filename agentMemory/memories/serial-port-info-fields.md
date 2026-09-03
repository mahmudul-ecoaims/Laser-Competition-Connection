---
name: serial-port-info-fields
description: All 7 SerialPortInfo fields, which are reliable, and where they're surfaced (More info modal)
tags: [serial, ui]
---

`SerialPort.list()` (see [[serial-transport]]) returns 7 fields per
`@serialport/bindings-interface`'s `PortInfo`: `path`, `manufacturer`,
`serialNumber`, `pnpId`, `locationId`, `productId`, `vendorId`. Only `path`
is guaranteed; everything else is OS/driver-dependent — confirmed by reading
`@serialport/bindings-cpp`'s three platform implementations rather than
assumed:

- **macOS** (`darwin_list.cpp`, IOKit): sets `manufacturer`, `serialNumber`,
  `vendorId`, `productId`, `locationId`. **Never sets `pnpId`** — that field
  isn't touched anywhere in the mac binding, so it's always `undefined` on
  this platform regardless of the device.
- **Windows** (`serialport_win.cpp`, SetupAPI registry queries): attempts
  all 7, `pnpId` included (the device's PnP instance path, e.g.
  `FTDIBUS\VID_0403+PID_6001+A9QG8KZZA\0000`) — the one platform that
  reliably provides it.
- **Linux** (`linux-list.js`, shells out to `udevadm info -e`): sets `path`,
  `manufacturer`, `serialNumber`, `vendorId`, `productId`, `pnpId` (from
  udev's `DEVLINKS` `/by-id/` symlink). **Never sets `locationId`** — no
  udev property is mapped to it.

Net effect: no platform is a superset of another — each drops a different
field (mac drops `pnpId`, Linux drops `locationId`, Windows drops neither
but its values obviously differ in format/content from the other two). Also
expect wildly different `path` formats: `/dev/tty.usbserial-XXXX` (mac),
`COM5` (Windows), `/dev/ttyUSB0` (Linux).

`serialService.listPorts()` maps all 7 into `SerialPortInfo`
(`src/shared/types/serial.ts`); the serial port list item in
`DevicePanel.tsx` only ever rendered `path` and `manufacturer` inline. All 7
are shown in full via a "More info" button on each list item (just before
Connect/Disconnect) that opens `SerialPortInfoModal.tsx` — a simple overlay
modal (click-outside or Cancel to close, Escape wired too) listing every
field, `—` for anything `undefined`. No other component reads the other
fields yet.
