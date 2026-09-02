# CLAUDE.md

Claude Code project instructions. Kept in sync with `AGENTS.md` (same
content) so Codex and other agents follow the same rules.

## Project

Electron + React + TypeScript desktop app connecting to the
laser-competition BLE target device. Architecture, conventions, and decision
history live in **[`agentMemory/`](agentMemory/)**:

- Read [`agentMemory/MEMORY.md`](agentMemory/MEMORY.md) first — it's an
  index, one line per memory file.
- Open only the memory files relevant to the current task. Read
  [`agentMemory/PROJECT.md`](agentMemory/PROJECT.md) before any change that
  touches the BLE service, IPC layer, or app structure.
- This is separate from your own personal cross-session memory —
  `agentMemory/` is checked into the repo and shared with every agent/dev
  working on this project.

## Commands

- `npm start` — dev
- `npm run typecheck` / `npm run lint` — must pass before calling a change done
- `npm run package` / `npm run make` — build distributables

## Ground rules

- Keep `contextIsolation`/`sandbox` on in `mainWindow.ts` — never relax for
  convenience.
- New IPC channel → `shared/ipc/channels.ts` + `registerHandlers.ts` +
  `preload.ts`/`electronApi.ts` together (see `agentMemory/PROJECT.md`).
- `@abandonware/noble` must stay external in `vite.main.config.ts` — see
  `agentMemory/memories/noble-vite-bundling-bug.md` before touching Vite
  config.
- `docs/constants/index.ts` is a read-only reference from the companion
  React Native app; its lint errors (unresolved RN imports) are expected and
  not to be "fixed".

## Updating memory

Learned something non-obvious (bug + fix, protocol detail, architecture
decision + why) that isn't already obvious from code or git history? Add one
file to `agentMemory/memories/` (same frontmatter shape as existing files)
and one line to `agentMemory/MEMORY.md`. One fact per file.
