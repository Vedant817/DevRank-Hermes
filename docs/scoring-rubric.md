# DevRank OS Scoring Rubric

Scores are deterministic and evidence-backed. The current implementation does
not ask an LLM to invent rankings; it matches stored evidence against explicit
rubric lanes and stores a score snapshot.

## Overall SDE Readiness

- DSA: 20%
- Backend/API: 15%
- Frontend/UI: 5%
- System Design: 10%
- GitHub Portfolio Quality: 15%
- Code Quality + Testing: 15%
- DevOps/Cloud: 8%
- AI Agent/Automation Skills: 7%
- Communication + Public Proof: 5%

Each lane records an evidence count and explanation. Weakest lanes drive daily
planning.

Stored score snapshots are checked against the current rubric before they drive
dashboards or daily planning. When the rubric changes, the app refreshes stale
snapshots from persisted scoring evidence instead of continuing to show legacy
lanes.

## PR Quality Score

The PR review dashboard uses a bounded 100-point deterministic score:

- Clarity of change: 25 points
- Test coverage evidence: 20 points
- Code structure and change size: 15 points
- Review response quality: 15 points
- CI health: 10 points
- Security/static-analysis sensitivity: 10 points
- Documentation evidence: 5 points

CI health is based only on imported GitHub check-run evidence for the current
PR head SHA. Passing CI receives 10 points only when at least one imported
check run completed with a `success` conclusion and every imported completed
check has an accepted terminal conclusion. Pending checks receive 3 points.
Missing, failing, stale, cancelled, timed-out, action-required, or neutral-only
evidence receives 0 CI points.

## Repo Portfolio Score

The repository dashboard scores each repo on the planned 100-point Repo
Portfolio rubric, mapped to importable GitHub evidence:

- Real-world problem clarity: 20 points (README present: 12, merged PR proof: 8)
- Architecture quality: 15 points (architecture documentation: 10, multi-technology stack: 5)
- Code quality: 15 points (merged-to-total pull request ratio)
- Tests/CI: 15 points (test evidence present)
- Deployment/demo: 10 points (deployment configuration present)
- README/docs: 10 points (README present)
- Technical depth: 10 points (bounded commit depth: 5, bounded technology breadth: 5)
- Uniqueness: 5 points (no tutorial-like name or tutorial-weak evidence pattern)

Problem clarity and uniqueness cannot be measured directly from metadata, so the
score uses the documented proxies above. The score is deterministic and capped
at 100. Each repo also receives explicit status labels: resume-ready, needs
README, needs tests, needs deployed demo, too tutorial-like, strong backend
depth, and does-not-prove-SDE-skill-yet.

## Current Flow

1. Ingest redacted local AI sessions into evidence items.
2. Persist evidence in `memory_items`.
3. Recompute `score_snapshots` from stored evidence.
4. Generate `daily_plans` from the weakest lanes in the latest snapshot.
