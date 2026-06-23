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

## Current Flow

1. Ingest redacted local AI sessions into evidence items.
2. Persist evidence in `memory_items`.
3. Recompute `score_snapshots` from stored evidence.
4. Generate `daily_plans` from the weakest lanes in the latest snapshot.
