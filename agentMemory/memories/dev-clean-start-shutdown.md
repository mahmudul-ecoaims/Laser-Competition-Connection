---
name: dev-clean-start-shutdown
description: npm start goes through scripts/start-clean.mjs, which sweeps stray forge/vite/electron processes on both startup and Ctrl+C
tags: [dev-tooling, electron-forge, process-management]
---

`npm start` doesn't run `electron-forge start` directly — `"start"` in
`package.json` is `node scripts/start-clean.mjs`, which wraps it. Reason:
Electron on macOS can end up running outside this terminal's process group
entirely (the OS's LaunchServices can launch `Electron.app` as a detached
top-level process), so a plain Ctrl+C to `electron-forge start` doesn't
reliably reach it — it can survive as an orphan.

**`sweepDevProcesses()`** works on all three platforms, via an OS-specific
process source and kill mechanism (`readProcesses`/`killPids` each dispatch
on `isWindows`):
- **mac/Linux**: `readProcessesPosix` shells out to `ps -axo
  pid=,ppid=,command=`; `killPidsPosix` SIGTERMs, then SIGKILLs whatever's
  still alive after an 800ms grace period.
- **Windows**: `readProcessesWindows` runs `Get-CimInstance Win32_Process |
  Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json` via
  `powershell.exe` (not the deprecated `wmic`) — JSON rather than
  PowerShell's table/CSV output, since a command line can itself contain
  commas/quotes a naive re-parse would mishandle. `killPidsWindows` force-
  kills each pid's whole tree with `taskkill /pid <pid> /t /f`, since
  Windows has no SIGTERM-style grace period to wait out. `readProcesses()`
  wraps whichever platform call in try/catch, treating any failure (e.g.
  PowerShell missing) as "found nothing to clean up" rather than crashing
  `npm start` — the sweep is a nice-to-have, not a prerequisite.

Either way, `matchesPreviousDevProcess` matches any process whose command
line both contains the project's absolute path and looks like the
project's electron-forge CLI, its Vite dev server, or its Electron
binary/app name; `collectDescendants` walks the whole descendant tree of
any match before killing. Matching is fully lowercased (`normalizeForCompare`)
since Windows paths/drive letters are case-insensitive and WMI's casing
doesn't always byte-match `__dirname`'s — harmless on POSIX, where the
literals compared against are already lowercase. `sweepDevProcesses`
explicitly protects this script's own ancestor chain (shell/npm/terminal)
via `getProtectedPids` so it can never kill its own lineage — but it does
NOT protect its own descendants, which is what makes it safe to reuse for
both purposes below.

**Dual use, added when Ctrl+C wasn't exiting cleanly:**
1. Once up front, before spawning `electron-forge start`, to clear any
   leftover session from a previous `npm start` that didn't exit cleanly.
2. From `shutdown(signal)`, registered on `process.on('SIGINT'/'SIGTERM')`
   on the wrapper itself — sends SIGTERM to the tracked `forgeChild`, waits
   800ms, then re-runs the same sweep to catch any detached Electron/Vite
   descendants the direct signal didn't reach, then `process.exit(0)`.
   `forgeChild`'s own `'exit'` handler routes through the same `shutdown()`
   if it exited via a signal (covers the common case where the terminal
   delivers SIGINT directly to the child too, since it's in the same
   foreground process group as the wrapper) — a `shuttingDown` flag makes
   the two trigger paths idempotent since they can race.

Verified end-to-end **on macOS only** (dev machine is a Mac — no Windows
box to test against): started `npm start`, confirmed the full Electron
process tree (main, GPU, network utility, renderer) was up, sent SIGINT to
the wrapper's PID, and within ~3s every laser-competition/electron-forge/
Electron process was gone with no stragglers. The Windows path
(`readProcessesWindows`/`killPidsWindows`) is implementation-reviewed but
**not** run against real hardware — if it misbehaves on an actual Windows
box, start there.
