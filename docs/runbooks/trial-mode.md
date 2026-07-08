# Trial Mode

Evaluate DevRank OS without any external services except a GitHub token.

## What it does

`trial:score` fetches public GitHub profile data — pull requests, commits, and check
runs — runs the SDE readiness rubric, and prints dimension-level scores.

- **No database required**
- **No Slack, Linear, or AI provider needed**
- **No environment file necessary** — just a GitHub token
- **No data persisted** — everything runs in-memory

## Prerequisites

A GitHub personal access token with `repo` scope (for public repos, a classic
token with no scopes also works):

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
```

## Run

```bash
pnpm devrank trial:score --user <github-username>
```

Optional flags:

| Flag | Default | Description |
|------|---------|-------------|
| `--user` | required | GitHub username to score |
| `--repo-limit` | 5 | Max repositories to scan |

## Example output

```text
{
  "username": "octocat",
  "evidenceCount": 47,
  "snapshot": {
    "overall": { "level": "intermediate_2", "score": 0.72 },
    ...
  },
  "note": "Trial score uses public GitHub data only. No database writes were performed."
}
```

## What's measured

The rubric evaluates SDE readiness across dimensions using evidence extracted from
public GitHub data:

- Code contributions (PRs merged, commits)
- Code review participation
- CI health (check run pass rates)
- Project complexity

## Limitations

- Only GitHub data is used — no AI session analysis, Linear tickets, or market
  benchmarking
- Scores are ephemeral; run `trial:score` again to refresh
- The snapshot is not stored; use the persisted pipeline
  (`github:backfill` + `scores:recompute`) for historical tracking

## Next steps

Once you're ready for the full system, follow the [quickstart](../setup/quickstart.md) to
set up a database and the [full setup](../setup/full-setup.md) to add integrations.
