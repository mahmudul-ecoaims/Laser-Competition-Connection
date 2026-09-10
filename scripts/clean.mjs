import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const dryRun = process.argv.includes('--dry-run');

const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--dry-run');
if (unknownArguments.length > 0) {
  console.error(`Unknown argument${unknownArguments.length === 1 ? '' : 's'}: ${unknownArguments.join(', ')}`);
  console.error('Usage: npm run clean -- [--dry-run]');
  process.exit(1);
}

// Keep this list deliberately narrow. Dependencies and source files are not
// cleanup targets; npm install can be expensive and project logs may be useful.
const disposablePaths = [
  '.vite',
  'out',
  'coverage',
  '.nyc_output',
  '.cache',
  '.npm',
  '.eslintcache',
  'tsconfig.tsbuildinfo',
  path.join('node_modules', '.cache'),
  path.join('node_modules', '.vite'),
];

const isInsideProject = (targetPath) => {
  const relativePath = path.relative(projectRoot, targetPath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
};

let removedCount = 0;

for (const relativePath of disposablePaths) {
  const targetPath = path.resolve(projectRoot, relativePath);

  if (!isInsideProject(targetPath)) {
    throw new Error(`Refusing to clean a path outside the project: ${targetPath}`);
  }

  if (!fs.existsSync(targetPath)) continue;

  console.log(`${dryRun ? 'Would remove' : 'Removing'} ${relativePath}`);
  if (!dryRun) fs.rmSync(targetPath, { recursive: true, force: true });
  removedCount += 1;
}

if (removedCount === 0) {
  console.log('Nothing to clean.');
} else if (dryRun) {
  console.log(`Dry run complete: ${removedCount} cleanup target${removedCount === 1 ? '' : 's'} found.`);
} else {
  console.log(`Clean complete: removed ${removedCount} cleanup target${removedCount === 1 ? '' : 's'}.`);
}
