# DevRank OS Docs App

This Next.js app is the project documentation surface for DevRank OS. It points
operators to the architecture, scoring rubric, verification gates, runtime
packages, and canonical database tables.

## Local Development

```bash
pnpm --filter docs dev
```

The app runs on port `3001` by default.

## Validation

```bash
pnpm --filter docs check-types
pnpm --filter docs lint
pnpm --filter docs build
```

## Source Docs

- `docs/architecture.md`
- `docs/architecture-decision-diagram.md`
- `docs/scoring-rubric.md`
- `docs/resume-bullets.md`
