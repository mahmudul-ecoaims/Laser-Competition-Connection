# AGENTS.md

Instructions for AI coding agents (Codex, Claude Code, etc.) working in this
repo. Claude Code: see `CLAUDE.md` — same content, Claude-specific pointers.

## Project

Electron + React + TypeScript desktop app that connects to the
laser-competition BLE target device. Full architecture, conventions, and
decision history live in **[`agentMemory/`](agentMemory/)**:

- Read [`agentMemory/MEMORY.md`](agentMemory/MEMORY.md) first — it's an
  index, one line per memory file.
- Open only the memory files relevant to your task. Read
  [`agentMemory/PROJECT.md`](agentMemory/PROJECT.md) before any change that
  touches the BLE service, IPC layer, or app structure.
- Don't read the whole `agentMemory/` folder for a small, unrelated change —
  that defeats the point of the index.

## Commands

- `npm start` — run in dev
- `npm run typecheck` — must pass before considering a change done
- `npm run lint` — must pass before considering a change done
- `npm run package` / `npm run make` — build distributables

## Ground rules

- Keep `contextIsolation`/`sandbox` on in
  `src/electron/main/windows/mainWindow.ts` — never relax them to make a
  feature easier.
- New IPC channels go through `src/shared/ipc/channels.ts`,
  `registerHandlers.ts`, and `preload.ts`/`electronApi.ts` together — see
  `agentMemory/PROJECT.md` for the exact 5-step pattern.
- Don't re-bundle `@stoprocent/noble` in Vite — see
  `agentMemory/memories/noble-vite-bundling-bug.md` before touching
  `vite.main.config.ts`.
- `patches/@stoprocent+noble+*.patch` fixes a real macOS connect-hang bug
  in that package — see
  `agentMemory/memories/noble-mac-connect-hang-fix.md` before upgrading
  `@stoprocent/noble` or touching the `postinstall` script that applies it.
- `docs/constants/index.ts` is a read-only reference copy from the companion
  React Native app. Don't "fix" its lint errors (unresolved RN imports) —
  it's not part of this build.

## Updating memory

When you learn something non-obvious (a bug + its fix, a hardware/protocol
detail, an architecture decision and its why) that isn't already obvious
from the code or git history, add one file to `agentMemory/memories/` (same
frontmatter format as the existing files) and one line to
`agentMemory/MEMORY.md`. Keep entries atomic — one fact per file.
