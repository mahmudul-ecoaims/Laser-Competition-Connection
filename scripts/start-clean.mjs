import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
// Windows paths are case-insensitive, and PowerShell/WMI can report drive
// letters/casing that doesn't byte-match __dirname's — lowercase everything
// being compared (both here and every literal it's compared against below)
// so that's never a source of a missed match. Harmless on POSIX too, since
// all the literal fragments compared against are already lowercase there.
const normalizeForCompare = (value) => value.replace(/\\/g, '/').toLowerCase();
const normalizedRoot = normalizeForCompare(projectRoot);
const appName = 'laser-competition';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readProcessesPosix = () => {
  const output = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], {
    encoding: 'utf8',
  });

  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) return null;

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        command: match[3],
      };
    })
    .filter(Boolean);
};

/**
 * Windows has no `ps`; the closest equivalent is querying the CIM/WMI
 * `Win32_Process` class for pid/parent-pid/command-line, via PowerShell
 * (built into Windows 10/11, unlike the now-deprecated `wmic`). JSON output
 * (`ConvertTo-Json`) is used rather than PowerShell's default table/CSV
 * formatting since a command line can itself contain commas/quotes that
 * would otherwise need fragile re-parsing.
 */
const readProcessesWindows = () => {
  const output = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      // Windows PowerShell 5.1 (unlike pwsh 7+) defaults redirected/piped
      // stdout to the console's legacy OEM codepage, not UTF-8 — so a
      // command line containing non-ASCII characters (an accented
      // username, a non-Latin project path, ...) would come back mangled
      // and could fail JSON.parse below. Forcing the console output
      // encoding to UTF-8 first keeps it matched with `encoding: 'utf8'`
      // on the Node side.
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );

  const trimmed = output.trim();
  if (!trimmed) return [];

  // A single matching process serializes to one object, not a one-item
  // array — normalize both shapes to an array.
  const parsed = JSON.parse(trimmed);
  const rows = Array.isArray(parsed) ? parsed : [parsed];

  return rows
    .filter((row) => row && typeof row.ProcessId === 'number')
    .map((row) => ({
      pid: row.ProcessId,
      // System/protected processes can report a null ParentProcessId.
      ppid: row.ParentProcessId ?? 0,
      // CommandLine is null for processes Win32_Process can't/won't expose
      // one for (e.g. other users' processes) — treat as unmatchable rather
      // than throwing.
      command: row.CommandLine ?? '',
    }));
};

// Wrapped in try/catch: if the platform command is missing or errors for
// any reason, treat it the same as finding nothing to clean up rather than
// crashing `npm start` — the cleanup is a nice-to-have, not a prerequisite.
const readProcesses = () => {
  try {
    return isWindows ? readProcessesWindows() : readProcessesPosix();
  } catch (error) {
    console.warn('Could not list running processes for cleanup:', error.message ?? error);
    return [];
  }
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const getProtectedPids = (processMap) => {
  const protectedPids = new Set([process.pid, process.ppid]);
  let currentPid = process.ppid;

  while (currentPid && processMap.has(currentPid)) {
    const parentPid = processMap.get(currentPid).ppid;
    protectedPids.add(parentPid);
    currentPid = parentPid;
  }

  return protectedPids;
};

const matchesPreviousDevProcess = (command) => {
  const normalizedCommand = normalizeForCompare(command);
  const belongsToProject = normalizedCommand.includes(normalizedRoot);
  const runsProjectElectron =
    belongsToProject &&
    (normalizedCommand.includes('/node_modules/electron/') ||
      normalizedCommand.includes('/.vite/build/main.js'));
  const runsProjectVite =
    belongsToProject &&
    (normalizedCommand.includes('/node_modules/vite/') ||
      normalizedCommand.includes('/node_modules/.vite/'));
  const runsForgeStart =
    belongsToProject &&
    normalizedCommand.includes('electron-forge') &&
    /\bstart\b/.test(normalizedCommand);

  return (
    runsForgeStart ||
    runsProjectElectron ||
    runsProjectVite ||
    (normalizedCommand.includes(appName) && normalizedCommand.includes('electron'))
  );
};

const collectDescendants = (rootPids, processes) => {
  const descendants = new Set(rootPids);
  let foundNewPid = true;

  while (foundNewPid) {
    foundNewPid = false;

    for (const item of processes) {
      if (!descendants.has(item.pid) && descendants.has(item.ppid)) {
        descendants.add(item.pid);
        foundNewPid = true;
      }
    }
  }

  return descendants;
};

// Windows has no SIGTERM-then-SIGKILL grace period to speak of — `taskkill`
// without /f asks nicely via WM_CLOSE, which a headless CLI/Vite process
// won't necessarily honor, so this goes straight to `/f` (force). `/t` also
// kills the pid's own descendant tree, which is redundant with `pids`
// already being descendant-expanded by the caller but is a harmless,
// cheap backstop for anything that briefly slipped past the WMI snapshot.
const killPidsWindows = (pids) => {
  console.log(`Closing previous laser-competition dev session (${pids.join(', ')}).`);

  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    } catch {
      // Already exited, or taskkill couldn't find it — fine either way.
    }
  }
};

const killPidsPosix = async (pids) => {
  console.log(`Closing previous laser-competition dev session (${pids.join(', ')}).`);

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process may have already exited.
    }
  }

  await sleep(800);

  for (const pid of pids) {
    if (!isAlive(pid)) continue;

    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // The process may have already exited.
    }
  }
};

const killPids = async (pids) => {
  if (pids.length === 0) {
    console.log('No previous laser-competition dev session found.');
    return;
  }

  if (isWindows) {
    killPidsWindows(pids);
    return;
  }

  await killPidsPosix(pids);
};

/**
 * Finds every forge/vite/electron process belonging to this project
 * (matchesPreviousDevProcess) other than this script's own ancestry, and
 * kills them — via `ps`/SIGTERM+SIGKILL on mac/Linux, via WMI/`taskkill /f`
 * on Windows (see readProcessesWindows/killPidsWindows). Only called from
 * `shutdown()` below, on Ctrl+C/SIGTERM — `npm start` itself never sweeps,
 * so starting a fresh session never kills one that's still running. Safe to
 * run repeatedly since `protectedPids` only ever protects this script's own
 * ancestor chain (shell/npm/terminal), never its own descendants.
 */
const sweepDevProcesses = async () => {
  const processes = readProcesses();
  const processMap = new Map(processes.map((item) => [item.pid, item]));
  const protectedPids = getProtectedPids(processMap);
  const matchingRootPids = processes
    .filter((item) => !protectedPids.has(item.pid))
    .filter((item) => matchesPreviousDevProcess(item.command))
    .map((item) => item.pid);

  const pidsToKill = [...collectDescendants(matchingRootPids, processes)]
    .filter((pid) => !protectedPids.has(pid))
    .sort((a, b) => b - a);

  await killPids(pidsToKill);
};

// Tracked so both the Ctrl+C handler and the child's own 'exit' event can
// reach it; `shuttingDown` makes the two paths idempotent — whichever fires
// first (they can race, since Ctrl+C in a terminal delivers SIGINT to the
// whole foreground process group, not just this script) runs the shutdown
// sequence exactly once.
let forgeChild = null;
let shuttingDown = false;

/**
 * Runs on Ctrl+C (SIGINT) or SIGTERM, and also when the forge child exits
 * because it caught a signal itself. Politely asks the child to stop, then
 * sweeps for anything left behind — notably a macOS Electron.app process,
 * which the OS can launch outside this terminal's process group entirely
 * (via LaunchServices), so it may never see the SIGINT/SIGTERM at all. This
 * is the only place that sweeps: `npm start` itself no longer clears out a
 * previous session, so it's Ctrl+C's job to leave nothing running behind.
 */
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\nStopping laser-competition dev session (${signal})...`);

  if (forgeChild && isAlive(forgeChild.pid)) {
    try {
      forgeChild.kill('SIGTERM');
    } catch {
      // Already exited.
    }
  }

  await sleep(800);
  await sweepDevProcesses();

  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

const startForge = () => {
  // Run the CLI's actual JS entry point via this same Node binary, rather
  // than the platform bin shim (`node_modules/.bin/electron-forge[.cmd]`).
  // On POSIX that shim is a symlink to this exact file with a `#!/usr/bin/env
  // node` shebang, so it's equivalent — but on Windows it's a generated
  // `.cmd` batch file, and since Node 18.20.2/20.12.2/21.7.3 (the
  // CVE-2024-27980 fix) `spawn()` refuses to run a `.cmd`/`.bat` file
  // directly unless `shell: true` is passed, so spawning the shim there
  // throws instead of starting electron-forge. Going straight to the JS
  // entry point sidesteps that entirely (and avoids reintroducing the
  // argument-quoting/injection surface `shell: true` would bring back),
  // and behaves identically to the shim on every platform.
  const forgeEntry = path.join(
    projectRoot,
    'node_modules',
    '@electron-forge',
    'cli',
    'dist',
    'electron-forge.js',
  );

  if (!fs.existsSync(forgeEntry)) {
    console.error('electron-forge was not found. Run npm install before npm start.');
    process.exit(1);
  }

  forgeChild = spawn(process.execPath, [forgeEntry, 'start'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  forgeChild.on('exit', (code, signal) => {
    if (shuttingDown) return; // shutdown() owns the exit path already.

    if (signal) {
      // electron-forge stopped because it received a signal itself (e.g.
      // Ctrl+C delivered directly to it as a member of the same foreground
      // process group) rather than via our shutdown() — route through the
      // same sweep instead of exiting immediately, so stragglers (e.g. a
      // detached macOS Electron.app) still get cleaned up now.
      void shutdown(signal);
      return;
    }

    process.exit(code ?? 0);
  });
};

try {
  startForge();
} catch (error) {
  console.error('Failed to start laser-competition:', error);
  process.exit(1);
}
