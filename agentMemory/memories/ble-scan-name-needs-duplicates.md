---
name: ble-scan-name-needs-duplicates
description: In-app BLE scan list showed LT700_40 as "Unknown device" (LT600_01 fine) — fixed by scanning with allowDuplicates true
tags: [ble, windows, scan, bug]
---

Symptom: in the app's own device-picker (`DevicePanel.tsx`, during
`startScan()` — not the OS's Windows Bluetooth settings, that's a
separate, already-resolved topic, see [[noble-windows-connect-unreliable]]),
`LT600_01` showed its real name in the scan list but `LT700_40` always
showed the `'Unknown device'` fallback (`DevicePanel.tsx`'s
`bleDevice.name ?? 'Unknown device'`).

Root cause: `bleService.ts`'s `startScan()` called
`noble.startScanningAsync([BLE_UUIDS.SERVICE], false)` — the second
argument is `allowDuplicates`. With it `false`, `@stoprocent/noble`'s
Windows binding (`lib/win/src/ble_manager.cc`'s `OnScanResult`) only
calls `mEmit.Scan(...)` (the native event that becomes JS's `'discover'`)
on the **first** advertisement packet ever seen for a given device per
scan session; every later packet for that device still updates the
native-side cached `PeripheralWinrt` state (`peripheral_winrt.cc`'s
`Update()`, which parses `ShortenedLocalName`/`CompleteLocalName` AD
types) but is never re-emitted to JS. If a device's name arrives in a
*later* BLE advertising PDU — most commonly the scan response, sent
separately from the primary advertising packet, which is exactly where
many BLE peripherals put their name to keep the primary PDU short —
whichever packet Windows' advertisement watcher happens to deliver
*first* wins permanently for that scan session. `LT600_01` apparently
advertises its name in the primary PDU (arrives first, works);
`LT700_40` apparently doesn't (name arrives later, if at all, and is
silently dropped).

First fix (necessary but not sufficient): pass `allowDuplicates: true`
instead (`src/electron/main/services/bleService.ts`'s `startScan()`), so
`'discover'` re-fires on every packet instead of just the first, letting
a later-arriving name update actually reach the renderer. Safe to do
unconditionally: the scan window is short (`BLE_SCAN_TIMEOUT_MS` = 15s)
and typically only a handful of target devices are nearby, and the
renderer (`useDevice.ts`'s `onDeviceDiscovered` handler) already
replaces-by-id and re-sorts by RSSI on every event.

**2026-09-07, tested on real hardware: `allowDuplicates: true` alone did
not fix it** — `LT700_40` still showed `'Unknown device'`. Found a
second, deeper bug in the same native function
(`lib/win/src/ble_manager.cc`'s `OnScanResult`): the
service-UUID-filter check (`if (!mScanServiceUUIDs.empty()) { ... if
(!found) return; }`) ran unconditionally on **every** received packet,
including packets for a device already tracked in `mDeviceMap` from an
earlier, matching packet. A scan-response packet commonly doesn't repeat
the service UUID (primary advertising PDU and scan response typically
split their AD structures — service UUIDs in one, local name in the
other, rather than duplicating everything in both), so that scan
response was dropped by the `return` **before ever reaching
`PeripheralWinrt::Update()`** — meaning the name was never captured
natively at all, regardless of `allowDuplicates`. `LT600_01` apparently
carries its name in the same primary PDU that carries the service UUID
(passes the filter, gets processed); `LT700_40` apparently splits them
(scan response with the name never passes the filter, gets dropped).

Second fix: only apply the service-UUID filter to a **new** (not yet in
`mDeviceMap`) device — once a device has already matched once, every
subsequent packet for it (scan responses included) now always reaches
`Update()` regardless of whether that specific packet repeats the
service UUID. The filter still does its job of keeping unrelated BLE
traffic out of `mDeviceMap` in the first place; it just no longer
blinds the app to supplementary data (name, manufacturer data, etc.)
that arrives in a later packet from a device already confirmed
relevant. Rebuilt from source (confirmed fresh), captured in
`patches/@stoprocent+noble+2.8.0.patch` alongside the other Windows
fixes.

**2026-09-07, CONFIRMED FIXED on real hardware**: `LT700_40`'s name now
shows correctly in the app's scan list.

## Follow-on UX point: list order jumps around (raised, then reverted)

Once `allowDuplicates: true` made `'discover'` re-fire on every
advertisement (necessary for the name fix above), `useDevice.ts`'s
`onDeviceDiscovered` handler also re-sorts the whole list by RSSI on
every single update — so rows can reorder/jump during a scan as signal
strength naturally fluctuates. A fix (sort by name instead of RSSI,
`src/renderer/features/device/useDevice.ts`) was tried and then
explicitly reverted by the user on 2026-09-07 — the list still sorts by
RSSI descending, unchanged from before this whole investigation. If this
comes up again, don't re-apply that fix without asking first; the user
may have a different UX preference in mind (e.g. sorting by RSSI is
apparently wanted, just not this particular reordering behavior, or a
different one entirely).
