---
name: noble-vite-bundling-bug
description: Vite/Rollup bundling noble's main-process code throws "Cannot find module @abandonware/bluetooth-hci-socket" at runtime
tags: [ble, build, bug, vite]
---

Symptom: `npm start` throws
`Error: Cannot find module '@abandonware/bluetooth-hci-socket'` when the main
process loads, even on macOS where that module's code path is never reached.

Root cause: electron-forge's Vite plugin bundles main-process node_modules by
default (only `electron` + Node builtins are external). Rollup's CJS interop
eagerly evaluates every `require()` branch in noble's
`lib/resolve-bindings.js` platform-selection logic (Linux/Windows/mac), even
ones behind an `if (platform === 'linux')` that's false at runtime on macOS —
so it throws on the Linux-only optional dependency that isn't installed.

Fix (already applied): mark `@abandonware/noble` external in
`vite.main.config.ts` (`build.rollupOptions.external`), so it stays a real,
unbundled `require()` at runtime and noble's own branching logic runs
correctly. Don't remove this — re-bundling noble will reintroduce the crash.
