# DevRank OS Scoring Rubric

Scores are deterministic and evidence-backed. The current implementation does
not ask an LLM to invent rankings; it matches stored evidence against explicit
rubric lanes and stores a score snapshot.

## Overall SDE Readiness

- DSA: 20%
- Backend/API/System Design: 20%
- GitHub Portfolio Quality: 15%
- Code Quality + Testing: 15%
- DevOps/Cloud: 10%
- AI Agent/Automation Skills: 10%
- Communication + Public Proof: 10%

Each lane records an evidence count and explanation. Weakest lanes drive daily
planning.

## Current Flow

1. Ingest redacted local AI sessions into evidence items.
2. Persist evidence in `memory_items`.
3. Recompute `score_snapshots` from stored evidence.
4. Generate `daily_plans` from the weakest lanes in the latest snapshot.
