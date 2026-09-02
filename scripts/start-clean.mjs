import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const normalizedRoot = projectRoot.replace(/\\/g, '/');
const appName = 'laser-competition';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readProcesses = () => {
  if (process.platform === 'win32') {
    return [];
  }

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
  const normalizedCommand = command.replace(/\\/g, '/');
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
    (normalizedCommand.includes(appName) && normalizedCommand.includes('Electron'))
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

const killPids = async (pids) => {
  if (pids.length === 0) {
    console.log('No previous laser-competition dev session found.');
    return;
  }

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

const stopPreviousSession = async () => {
  if (process.platform === 'win32') {
    console.log('Clean start process cleanup is not implemented on Windows yet.');
    return;
  }

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

const startForge = () => {
  const forgeBin =
    process.platform === 'win32'
      ? path.join(projectRoot, 'node_modules', '.bin', 'electron-forge.cmd')
      : path.join(projectRoot, 'node_modules', '.bin', 'electron-forge');

  if (!fs.existsSync(forgeBin)) {
    console.error('electron-forge was not found. Run npm install before npm start.');
    process.exit(1);
  }

  const child = spawn(forgeBin, ['start'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`electron-forge start stopped with signal ${signal}.`);
      process.exit(1);
    }

    process.exit(code ?? 0);
  });
};

stopPreviousSession()
  .then(startForge)
  .catch((error) => {
    console.error('Failed to cleanly start laser-competition:', error);
    process.exit(1);
  });
