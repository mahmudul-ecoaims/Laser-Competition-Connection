---
name: ble-target-uuids
description: GATT service/characteristic UUIDs for the laser-competition target device
tags: [ble, hardware, protocol]
---

The BLE target device advertises one GATT service with two characteristics.
Source of truth is the React Native app's `docs/constants/index.ts`
(`GLOBALS.SERVICE`), mirrored in this app at `src/shared/constants/ble.ts`:

- Service: `0bd51666-e7cb-469b-8e4d-2742f1ba77cc`
- Command characteristic: `e7add780-b042-4876-aae1-11285535f821` — writes
  (fire/arm/etc.) and, if it advertises notify/indicate, pushes incoming
  messages back (see [[ble-terminal-protocol]]).
- Settings characteristic: `e7add780-b042-4876-aae1-11285535f721` — device
  settings read/write.

If the device firmware ever changes these UUIDs, update
`src/shared/constants/ble.ts` — nowhere else.

Cross-confirmed independently: another RN app implementing the same
device's `INFO01` master-discovery command documents its write target as
`e7add780-b042-4876-aae1-11285535f721` — i.e. this app's Settings
characteristic, not Command. That mismatch (this app was writing SIP/INFO
to Command) was the actual cause of BLE SIP/INFO getting no reply — see
[[sip-time-sync-protocol]].
