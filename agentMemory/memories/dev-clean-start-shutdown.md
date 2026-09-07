---
name: dev-clean-start-shutdown
description: npm start goes through scripts/start-clean.mjs, which sweeps stray forge/vite/electron processes on Ctrl+C (not on startup)
tags: [dev-tooling, electron-forge, process-management]
---

`npm start` doesn't run `electron-forge start` directly — `"start"` in
`package.json` is `node scripts/start-clean.mjs`, which wraps it. Reason:
Electron on macOS can end up running outside this terminal's process group
entirely (the OS's LaunchServices can launch `Electron.app` as a detached
top-level process), so a plain Ctrl+C to `electron-forge start` doesn't
reliably reach it — it can survive as an orphan.

The sweep only ever runs from the Ctrl+C/SIGTERM path (`shutdown()`) —
**`npm start` itself no longer sweeps on startup.** Earlier it swept up
front too (see git history), but that meant starting a fresh session could
silently kill one still running; per explicit user instruction the cleanup
now happens only when the user presses Ctrl+C on a running session, not
when a new `npm start` begins.

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

**Single use point**, from `shutdown(signal)`, registered on
`process.on('SIGINT'/'SIGTERM')` on the wrapper itself — sends SIGTERM to
the tracked `forgeChild`, waits 800ms, then runs the sweep to catch any
detached Electron/Vite descendants the direct signal didn't reach, then
`process.exit(0)`. `forgeChild`'s own `'exit'` handler routes through the
same `shutdown()` if it exited via a signal (covers the common case where
the terminal delivers SIGINT directly to the child too, since it's in the
same foreground process group as the wrapper) — a `shuttingDown` flag makes
the two trigger paths idempotent since they can race.

Verified end-to-end **on macOS only** (dev machine is a Mac — no Windows
box to test against): started `npm start`, confirmed the full Electron
process tree (main, GPU, network utility, renderer) was up, sent SIGINT to
the wrapper's PID, and within ~3s every laser-competition/electron-forge/
Electron process was gone with no stragglers. The Windows path
(`readProcessesWindows`/`killPidsWindows`) is implementation-reviewed but
**not** run against real hardware — if it misbehaves on an actual Windows
box, start there.

**`startForge()` spawns electron-forge's JS entry point directly**
(`node_modules/@electron-forge/cli/dist/electron-forge.js`, via
`spawn(process.execPath, [entry, 'start'], ...)`), not the
`node_modules/.bin/electron-forge[.cmd]` shim. This isn't just a style
choice — spawning the shim would be **broken on Windows**: since Node
18.20.2/20.12.2/21.7.3 (the CVE-2024-27980 fix), `child_process.spawn()`
throws instead of running a `.bat`/`.cmd` file unless `shell: true` is
passed, and the Windows shim is a generated `.cmd`. On POSIX the shim is
just a symlink to that same JS file with a `#!/usr/bin/env node` shebang,
so going straight to the JS file is a no-op change there and the actual fix
on Windows. Don't revert to spawning the `.bin` shim.

`readProcessesWindows` also forces `[Console]::OutputEncoding =
[Text.Encoding]::UTF8` before the `Get-CimInstance | ConvertTo-Json`
pipeline — Windows PowerShell 5.1 (unlike pwsh 7+) defaults redirected
stdout to the console's legacy OEM codepage, which could mangle a command
line containing non-ASCII characters (accented username, non-Latin path)
and break the `JSON.parse` on the Node side.
