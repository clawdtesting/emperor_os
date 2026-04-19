# Runtime Migration Note (Historical)

This repository currently executes from the `agent/` tree, including `agent/Job-v1`, `agent/Job-v2`, and `agent/prime-*` modules.

Earlier protocol/runtime split proposals (e.g., `protocols/*`, `runtime/*`, `app/*`) are not the active canonical structure in this repo state.

## Current guidance
- Treat `agent/` as runtime source of truth.
- Keep migration planning separate from operator runbooks.
- If/when a new runtime layout is introduced, update:
  - [CURRENT_SYSTEM.md](./CURRENT_SYSTEM.md)
  - [state-machines.md](./state-machines.md)
  - [docs/README.md](./README.md)

This file is retained as a compact reference to avoid repeating stale migration assumptions in other docs.
