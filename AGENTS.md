# AGENTS.md

## Goal
Build this project iteratively until tests, lint, and build pass.

## Commands
- Install: pnpm install
- Test: pnpm test
- Lint: pnpm run lint
- Build: pnpm run build

## Rules
- Make small, focused changes.
- Do not add new dependencies unless necessary.
- After every feature or task, run the relevant validation gate.
- If tests fail, inspect the error and fix only the relevant issue.
- After a feature or task passes its gate, stage only the files changed for that feature.
- Commit each completed feature or task separately with a clear commit message before starting the next unrelated feature.
- Do not bundle unrelated feature files into one commit just because they were edited in the same session.
- Keep `Task.md` updated as the checkpoint file, but commit it with the feature/task whose status changed.
- Stop when all validation commands pass.
