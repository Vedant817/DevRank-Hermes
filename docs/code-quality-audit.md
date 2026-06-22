# Code Quality Audit

This audit ranks the current implementation by maintainability, production
readiness, test coverage, and scaling risk.

| Area | Rating | Notes |
| --- | ---: | --- |
| `packages/shared` | 8/10 | Clear types, env validation, and shared constants. Keep domain-specific constants limited. |
| `packages/scoring` | 8/10 | Small deterministic scoring core with focused tests. Future risk is rubric configurability. |
| `packages/planner` | 8/10 | Production-friendly deterministic planner and Slack formatting. Watch for growth in one file. |
| `packages/slack` | 8/10 | Small integration wrapper with explicit env failure paths upstream. |
| `packages/search` | 7.5/10 | Clear provider boundary and tests. Needs adapter interface before adding more providers. |
| `packages/embeddings` | 7.5/10 | Good config guards and response validation. Provider-neutral naming can be improved later. |
| `packages/github` | 7/10 | Real REST/webhook ingestion with tests. More PR analysis domains should be split before adding files/reviews/checks. |
| `packages/linear` | 7/10 | Focused GraphQL/webhook surface. Needs richer workspace/team/cycle coverage before scaling. |
| `packages/hermes` | 7/10 | Good bounded-AI guards and tests. Reusable skills code is getting dense. |
| `packages/ai-chat-ingestors` | 7/10 | Adapter shape is good and privacy checks are strong. More fixtures per source will help. |
| `apps/local-agent` | 7/10 | Good config/state separation. Launchd and daemon operations are workable but can be split further. |
| `apps/web` | 6.5/10 | Routes are production-oriented, but ingestion and route utility modules are large. |
| `apps/worker` | 6.5/10 | Simple job runner. Needs queue semantics before heavy production load. |
| `packages/db` | 5.5/10 | SQL is explicit and production-safe, but `repositories.ts` mixes many domains and evidence mappers. |
| `apps/cli` | 5/10 | Useful operator surface, but command registry, env checks, invocation, and persistence are all in one large file. |

## Highest-priority cleanup backlog

- Split domain-specific DB code out of `packages/db/src/repositories.ts`.
- Split CLI command groups and persistence helpers out of `apps/cli/src/index.ts`.
- Add repository-level tests around DB SQL mapping using a test SQL client or integration database.
- Extract large web route parsing/persistence helpers from `apps/web/app/api/ingest/local-ai/route.ts`.
- Introduce provider interfaces before adding additional search, embedding, or AI vendors.
