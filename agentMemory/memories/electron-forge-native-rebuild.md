---
name: electron-forge-native-rebuild
description: electron-forge auto-rebuilds native node modules (noble) for Electron's ABI on start/package
tags: [build, electron-forge]
---

`forge.config.ts` has `rebuildConfig: {}`, which makes `electron-forge
start`/`package`/`make` automatically run `@electron/rebuild` against native
deps (confirmed: system Node ABI 137 vs. Electron 44's ABI 149 — mismatched
by default, so this matters). No manual `electron-rebuild` step is needed
when adding a new native dependency; forge handles it.

If a fresh native install throws an npm `allow-scripts` warning (install
scripts blocked), approve just that package
(`npm approve-scripts <pkg>`) rather than approving everything pending.
