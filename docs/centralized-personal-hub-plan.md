# DevRank OS Centralized Personal Hub Plan

- Status: verified product and implementation plan
- Prepared: 2026-09-09
- Scope: private single-owner product, native Hermes integration, and continuous learning

## 1. Executive Decision

DevRank OS will become a private growth ledger shared by one developer and one
primary Hermes profile. It is not a public portfolio, a developer leaderboard,
or a collection of source-specific dashboards.

The core promise is:

> Know the most useful next action, complete it with attributable proof, retain
> the lesson, and give Hermes better context for the next decision.

The smallest complete product loop is:

`Today -> Attempt -> Proof -> Lesson -> Delayed review -> Better next action`

The product has two connected portfolios:

| Portfolio | What it answers | Canonical records |
| --- | --- | --- |
| Person | What am I trying to improve, what can I now demonstrate, and what should I do next? | goals, learning runs, evidence, reviews, outcomes |
| Agent | What has Hermes learned, which skills work, where does it fail, and what may it remember or automate? | agent runs, approved memories, skill versions, evaluations, decisions |

The shared layer is the work itself: a recommendation, its proof, the lesson
derived from it, and the later review. This shared layer is the product wedge.

## 2. Verified Inputs

This plan is based on three evidence sources.

### Repository audit

The current repository already provides:

- Local AI-session ingestion with raw upload and embeddings disabled by default.
- Deterministic scoring, planning, DSA selection, task persistence, and score trends.
- GitHub, GitLab, Linear, Slack, market-search, context, and Supermemory integrations.
- Private dashboard access using a fail-closed single-owner deployment boundary.
- Optional provider-backed mentor, score explanation, PR review, and content workflows.
- Eight dashboard routes plus a public GitHub trial.

The important verified gaps are:

- `@repo/hermes` is an OpenAI-compatible provider wrapper and prompt-workflow
  package, not the native Nous Hermes Agent runtime.
- Current readiness percentages are keyword-matched evidence coverage. One
  matching item produces 68 points in a lane and five produce 100.
- GitHub repository ownership does not establish personal authorship of every
  imported commit or pull request. Pull-request summaries do not store authors.
- Generic task completion has no required proof classification or reflection.
- DSA completion is self-attested and automatically states that patterns and
  complexity were reviewed.
- Existing context retrieval is lexical `ILIKE` search; stored embeddings are
  not used for retrieval.
- Supermemory writes exist, but complete consent, correction, retention,
  reconciliation, and erasure controls do not.
- The private UI is organized around implementation dashboards rather than the
  user's decisions.

Repository references are listed in section 20.

### PM review

Four independent PM audits were run from these perspectives:

1. Personal operating-system strategy.
2. Learning science and behavior design.
3. Hermes agent and memory architecture.
4. Privacy, evidence trust, and career outcomes.

The findings were relayed back to all four PMs for a cross-review. The consensus was:

- Make one time-budgeted action the center of the private product.
- Require classified proof and one lesson before an action becomes a qualified loop.
- Reframe current readiness scores as Evidence Coverage.
- Fix attribution and correction before using evidence for personal claims.
- Keep recommendation ranking, state changes, auth, scoring, and validation deterministic.
- Introduce native Hermes first as a read-only reviewer over bounded proof bundles.
- Use built-in Hermes memory and skills with write approval before considering an external memory provider.
- Do not block the solo product on multi-tenant architecture or a generalized agent platform.

The main disagreement was the north-star metric. Career-opportunity advancement
is too delayed and sparse for the initial product, while task completion is too
easy to game. The selected north star is defined in section 15.

### Current Hermes documentation

The native Hermes plan was checked against current official documentation on
2026-09-09. Native Hermes currently supports:

- CLI, Desktop, gateway messaging, and a persistent session store with FTS5 search.
- Bounded `MEMORY.md` and `USER.md` stores, memory write approval, and a learning journey.
- Agent-created skills, project-local skills, external skill directories, and skill write approval.
- MCP clients with per-server tool filtering and stdio or HTTP transports.
- Agent cron, no-agent script cron, execution history, provider drift guards, and delivery.
- Delegation, profiles, external memory-provider plugins, and security controls.

Official sources are listed in section 21.

## 3. Product Definition

### Primary user

A solo early-career or transitioning software engineer who uses AI coding agents,
builds projects, practices interview skills, and wants a trustworthy private
record of growth without maintaining a public portfolio manually.

### Jobs to be done

| Job | Product response |
| --- | --- |
| Decide what matters now | Show one action that fits the user's current focus, time, and due reviews. |
| Understand why | Explain deterministic reason codes and link the evidence used. |
| Learn while working | Add retrieval, prediction, validation, and reflection to real work instead of separating learning from execution. |
| Retain proof | Capture an attributable artifact and its verification level. |
| Avoid repeated mistakes | Turn approved lessons into future review prompts and optional Hermes skills or memory. |
| Understand progress | Show qualified loops, proof quality, retained lessons, and goal movement rather than activity volume alone. |
| Give Hermes reliable context | Expose bounded, cited, owner-scoped read tools rather than raw database access. |
| Correct the system | Let the owner replace, exclude, restore, or delete evidence and agent suggestions. |
| Learn on the go | Continue the same Today/review flow through mobile web and one Hermes gateway channel. |

### Non-goals

- Public developer ranking or hireability prediction.
- Employer, team, or surveillance analytics.
- Multi-user SaaS before every row and query is tenant-safe.
- Automatic publishing, job applications, recruiter messages, merges, or deployments.
- Raw-transcript cloud synchronization by default.
- A complete course platform, LeetCode replacement, or universal skill ontology.
- A generic multi-agent orchestration framework.
- More integrations before the daily learning loop is useful.

## 4. Product Principles

1. One decision before many metrics.
2. Proof before claims.
3. Learning state before streaks.
4. Postgres facts before model summaries.
5. User approval before durable agent learning.
6. External egress must be visible and optional.
7. A missed day causes replanning, not punishment.
8. A score describes the evidence available, not the person's worth or employability.
9. The product must remain useful with every AI and external-memory credential removed.
10. Add agent autonomy only after the read-only version proves value.

## 5. Information Architecture

The private navigation will use five user-intent destinations.

| Destination | Purpose | Existing views absorbed |
| --- | --- | --- |
| Today | One action, optional due review, proof capture, lesson, and Hermes review | learning plan, DSA workbench |
| Progress | Active focus, qualified loops, coverage trends, reviews, and outcomes | command center, AI learning summary |
| Evidence | Source timeline, attribution, validation, corrections, exclusions, and source health | GitHub/GitLab/Linear source rows, PR evidence |
| Library | Projects, DSA questions, approved lessons, and reusable skills | portfolio, PR review, skill artifacts |
| Settings | Identity aliases, integrations, privacy, AI permissions, memory, notifications, and data controls | setup status and environment-oriented controls |

The existing source dashboards remain available as drill-downs during migration.
They stop being the primary navigation model.

The public GitHub trial remains isolated from the private product. It may stay at
`/` as an acquisition experiment or later move to `/trial`; it must not share the
private north star, claims, or information architecture.

### Signature interaction

The central visual element is a trace rail, not a grid of score cards:

```text
NOW              PROOF                 LESSON                REVIEW
[one action] --> [source + level] --> [next-time rule] --> [due date/result]
```

Every stage is inspectable. The rail should make missing proof or review visible
without presenting the user as failing.

### Desktop Today

```text
+-----------------------------------------------------------------------+
| Today        Progress       Evidence       Library       Settings      |
+-----------------------------------------------------------------------+
| Focus: Backend interview depth          Time: [30 min v]  Energy: [M] |
|                                                                       |
| YOUR NEXT ACTION                                                      |
| Implement and test one rate-limiter edge case                         |
| Why now: due review + weak recent testing proof                       |
| Proof contract: passing test + commit URL                             |
| [Start] [Swap] [Defer]                                                |
|                                                                       |
| Action ---- Attempt ---- Proof ---- Lesson ---- Review due             |
|                                                                       |
| Hermes review (optional) [Preview data] [Ask Hermes]                  |
+-----------------------------------------------------------------------+
```

### Mobile Today

The mobile screen shows only the focus, selected time, one action, and the next
available control. Proof and lesson inputs expand after the attempt. Agent chat
is a sheet, not a competing home page.

## 6. The Qualified Learning Loop

### State model

```text
recommended
  -> accepted -> started -> completed -> proof_submitted -> qualified
  -> partial -> review_due
  -> blocked -> replanned
  -> deferred
  -> rejected
```

The lifecycle must be event-auditable even if the initial table stores the
current state for efficient reads.

### Minimum inputs

- Active focus or goal.
- Available minutes: 5, 15, 30, 60, or 120.
- Optional energy: low, normal, high.
- Current unfinished work and due reviews.
- Trusted Evidence Coverage gaps.

### Recommendation policy

The first policy is deterministic:

```text
priority =
  urgent commitment
  + due-review urgency
  + active-focus relevance
  + uncertainty reduction
  + proof value
  + time fit
  - recent repetition
  - unresolved prerequisite
  - estimated overload
```

Policy rules:

1. Never exceed the chosen time budget.
2. Show exactly one primary action and at most one collapsed alternative.
3. A due review outranks new work when it matches the current focus and budget.
4. A blocked or partial attempt changes the next recommendation.
5. Rejection requires one bounded reason: irrelevant, duplicate, too hard, too
   easy, blocked, wrong estimate, or not now.
6. Opening or starting work never changes Evidence Coverage.
7. A qualified proof can change coverage; a duplicate cannot.

### Proof contract

Every recommendation declares acceptable proof before the work starts.

Proof levels:

| Level | Meaning | Examples |
| --- | --- | --- |
| externally_verified | A trusted external system confirms the result | accepted submission, CI check, merged owner-authored PR |
| machine_observed | DevRank can inspect the artifact or validator output | passing local test, checked commit, generated report |
| self_attested | The owner records an attempt without independent verification | reflection, manual DSA solve, reading note |

Self-attested work remains valuable but cannot silently become externally
verified skill proof or a first-person career claim.

### Lesson and review

A lesson contains:

- What was attempted.
- What changed, failed, or surprised the user.
- One next-time rule.

Initial deterministic review intervals:

- Blocked: next day.
- Partial: three days.
- Completed with qualified proof: seven days.
- First successful delayed review: 21 days.
- Failed delayed review: retry within three days.

The initial learner state has only four labels:

- `unassessed`
- `in_progress`
- `verified_recently`
- `review_due`

Do not use `mastered` until retained transfer is measured.

## 7. Evidence And Trust Model

### Immediate trust contract

DevRank must be able to state:

> DevRank privately recommends one deterministic action. Completing it records
> classified proof and a lesson. Raw transcripts and embeddings are off by
> default. Evidence Coverage describes available evidence, not employability.
> External AI is optional and cannot change canonical learning state.

### Minimum evidence fields

| Field | Purpose |
| --- | --- |
| owner_id | Deployment owner; mandatory on every new product table |
| source | Connector or manual origin |
| source_id | Stable external or local identity |
| source_url | Inspectable artifact when available |
| actor_identity | Author or performer reported by the source |
| attribution | `verified_self`, `self_declared`, `repository_context`, or `unknown` |
| proof_level | External, machine-observed, or self-attested |
| validation_status | `pending`, `passed`, `failed`, or `not_available` |
| derivation | Direct source or the IDs from which a claim was derived |
| confidence | Bounded evidence confidence, not mastery confidence |
| inclusion_status | `included`, `excluded`, `superseded`, or `deleted` |
| observed_at | When DevRank received it |
| occurred_at | When the work occurred |

### Corrections

The first correction model is intentionally narrow:

- Replace attribution, proof, or lesson.
- Exclude and restore evidence.
- Delete a Today learning record and invalidate its derived coverage.
- Preserve a minimal audit event without retaining deleted sensitive content.

A generalized event-sourcing platform is not required for the first release.

### GitHub attribution blocker

Before GitHub activity can become personal proof:

- Store pull-request author login.
- Configure approved GitHub identities in Settings.
- Match commit author login or verified commit identity where available.
- Treat unmatched repository activity as `repository_context`.
- Prevent repository ownership alone from enabling `Built`, `Delivered`, or
  `Shipped` claims.

The GitLab backfill already requests user-authored commits and merge requests,
but persisted attribution must still be displayed and correctable.

## 8. Evidence Coverage, Not Readiness

### Release 0 language change

All user-facing references to SDE Readiness, Skill Rank, mastery, and score-based
hireability become Evidence Coverage. Existing function and table names can
remain temporarily to keep this first change surgical.

The UI must show:

- Model or rubric version.
- As-of timestamp.
- Evidence count and proof-level composition.
- Unknown or unassessed separately from zero.
- A link to included and excluded evidence.
- A clear statement that coverage is not competency or hiring probability.

### Coverage model v1

The next rubric version must:

- Count stable evidence claims rather than repeated textual mentions.
- Prevent one artifact and its derived summaries from voting multiple times.
- Exclude unknown authorship from personal contribution coverage.
- Include proof level, freshness, and source independence.
- Store exact included evidence IDs and a reproducibility hash.
- Keep deterministic calculations and version every rule change.

A separate mastery model is deferred until verified attempts and delayed reviews
provide enough observations.

## 9. Native Hermes Architecture

### Boundary

DevRank remains the system of record. Native Hermes becomes the conversational,
reasoning, skills, session, and on-the-go agent runtime.

```text
                         user
                web / desktop / Telegram
                          |
          +---------------+----------------+
          |                                |
     DevRank web                      Native Hermes
  Today and evidence             chat, skills, memory,
          |                      session search, gateway
          +---------------+----------------+
                          |
                narrow DevRank MCP bridge
                          |
             deterministic application services
                          |
             Postgres canonical growth ledger
```

The existing `@repo/hermes` package should be renamed conceptually in docs as
the DevRank AI workflow adapter until native Hermes is integrated. It may remain
for bounded server-side explanations and fallbacks; it must not be presented as
the native Hermes runtime.

### Why MCP

Native Hermes already supports HTTP and stdio MCP servers, dynamic tool
discovery, per-server include/exclude filters, and filtered credentials. A
narrow DevRank MCP bridge avoids giving Hermes a database password and keeps
authorization, validation, and audit behavior in the TypeScript application.

Recommended transport: authenticated HTTPS MCP endpoint backed by DevRank
application services. Use a dedicated read token, resolve the owner server-side,
rate-limit calls, and never accept `owner_id` from a tool argument.

### First read-only MCP tools

| Tool | Output | Bound |
| --- | --- | --- |
| `devrank_get_today` | Focus, budget, primary action, reason codes, proof contract | One current run |
| `devrank_get_proof_bundle` | Selected action, proof, validation output, related evidence | Explicit run ID only |
| `devrank_get_learning_history` | Recent qualified loops, lessons, and review results | 30 records |
| `devrank_get_due_reviews` | Due reviews matching current focus | 10 records |
| `devrank_get_evidence` | Provenance and inclusion state | Explicit IDs, maximum 25 |
| `devrank_get_agent_portfolio` | Agent runs, skill evaluations, repeated failures | 30-day aggregate |

No mutation tool is exposed in the first native Hermes release.

### First Hermes skills

Skills live under project-local `.hermes/skills/` and use
`skills.write_approval: true`.

| Skill | Job | Allowed tools |
| --- | --- | --- |
| `devrank-proof-reviewer` | Review one proof bundle, identify missing validation, ask one reflection question, and propose one lesson | `devrank_get_proof_bundle`, `devrank_get_evidence` |
| `devrank-learning-coach` | Explain one deterministic Today recommendation and offer a bounded alternative that fits the same budget | `devrank_get_today`, `devrank_get_learning_history`, `devrank_get_due_reviews` |
| `devrank-weekly-review` | Synthesize qualified loops, delayed reviews, repeated mistakes, and the next focus | `devrank_get_learning_history`, `devrank_get_due_reviews`, `devrank_get_evidence` |
| `devrank-agent-curator` | Review Hermes run quality and propose memory or skill corrections | `devrank_get_agent_portfolio` |

Only the first three are needed before the Agent Portfolio release.

### Hermes surfaces to use

| Hermes capability | Planned use | Release |
| --- | --- | --- |
| CLI/Desktop | Deep review and setup | Native Hermes foundation |
| Project context files | Load DevRank operating rules and product vocabulary | Native Hermes foundation |
| Project-local skills | Proof review, learning coach, weekly review | Read-only agent |
| Built-in memory | Compact preferences, focus, constraints, and approved durable lessons | Read-only agent |
| Memory write approval | Stage all memory changes before they affect later sessions | Native Hermes foundation |
| Skill write approval | Stage agent-created or improved skills for review | Native Hermes foundation |
| Session search | Recall prior conversations without copying them into DevRank Postgres | Read-only agent |
| Learning Journey | Inspect and correct what Hermes has learned | Agent Portfolio |
| MCP client | Read bounded canonical DevRank context | Read-only agent |
| Gateway | Continue Today/review conversations on one mobile channel | On-the-go release |
| Cron | Deliver a weekly review or due-review prompt, never own canonical scheduling | On-the-go release |
| Delegation/MoA | Read-only monthly portfolio audit after single-agent quality is proven | Later evaluated automation |
| External memory plugin | Optional approved semantic/cross-agent recall | Memory gate only |

### What not to duplicate

- Do not rebuild Hermes session search inside Postgres.
- Do not copy full Hermes conversations into DevRank by default.
- Do not build a second generic skill marketplace.
- Do not maintain separate unsynchronized memory in native Hermes, the current
  direct Supermemory connector, and another provider.
- Do not use both Hermes cron and Vercel cron as owners of the same schedule.
- Do not give a Hermes skill shell or database access when an MCP read tool is sufficient.

## 10. Memory Architecture

### Four tiers

| Tier | Store | Contents | Authority |
| --- | --- | --- | --- |
| Raw private history | Local source files and Hermes session SQLite | transcripts and complete conversations | Source only; local by default |
| Structured facts | DevRank Postgres | actions, proof, attribution, scores, reviews, outcomes, run receipts | Canonical |
| Active agent memory | Native Hermes `MEMORY.md` and `USER.md` | compact preferences, constraints, active focus, approved durable lessons | Agent context, not evidence |
| Optional semantic memory | One Hermes memory-provider plugin | approved low-sensitivity summaries requiring cross-session semantic recall | Supporting context only |

### Initial policy

- Enable built-in Hermes memory.
- Set `memory.write_approval: true`.
- Set `skills.write_approval: true`.
- Keep background review enabled only after its provider/cost is configured and
  notifications are visible.
- Save compact preferences and reusable rules, not activity logs or raw proof.
- Use Hermes session search for historical conversation recall.
- Keep DevRank proof and review records in Postgres.

### External provider gate

Do not enable an external Hermes memory provider for the core loop until:

- At least 50 approved lessons exist.
- A 30-query retrieval fixture shows lexical or structured retrieval misses useful context.
- The user needs recall across at least two agent clients or profiles.
- Consent, provider disclosure, export, correction, deletion, retention, and
  reconciliation exist.
- Deleting a canonical lesson invalidates or deletes its external copy.

Provider choice at that gate:

| Need | Candidate |
| --- | --- |
| Local-only trust-scored recall | Holographic |
| Self-hosted hierarchy and tiered reading | OpenViking |
| Cross-profile user-agent modeling | Honcho |
| Existing project compatibility or hosted/self-hosted semantic graph | Supermemory |

Only one external Hermes provider can be active at a time. If Supermemory is
selected, route new agent memory through the native Hermes plugin and retire or
restrict the current direct app connector to prevent split-brain writes.

### pgvector gate

Use the existing Postgres embedding infrastructure only after a labeled
retrieval set exists. Ship vector retrieval only if it improves Recall@5 by at
least 15 percentage points over lexical/structured retrieval, returns no
cross-scope results, and keeps p95 retrieval below 300 ms.

## 11. Agent Run And Approval Model

Avoid a generic workflow engine. Start with two tables.

### `agent_runs`

- `id`
- `owner_id not null`
- `skill_name`
- `skill_version`
- `prompt_version`
- `trigger`
- `status`: `running`, `succeeded`, `failed`, `rejected`
- `input_hash`
- `evidence_refs jsonb`
- `tool_calls jsonb`
- `output jsonb`
- `provider`
- `model`
- `input_tokens`
- `output_tokens`
- `estimated_cost`
- `policy_result jsonb`
- `evaluation_result jsonb`
- `started_at`
- `completed_at`
- `error_code`

### `agent_decisions`

- `id`
- `owner_id not null`
- `run_id`
- `decision`: `accepted`, `corrected`, `rejected`, `discarded`
- `original_output jsonb`
- `corrected_output jsonb`
- `destination`
- `idempotency_key`
- `decided_at`
- `applied_at`

Do not store hidden chain-of-thought. Store concise execution summaries, cited
IDs, tool results, policy decisions, and user corrections.

Every model result must pass:

1. Zod schema validation.
2. Citation allowlist validation.
3. Required factual-claim citation checks.
4. Secret and sensitivity scanning.
5. Duration and action-boundary validation.

## 12. Deterministic And Agentic Responsibilities

### Must remain deterministic

- Authentication, owner resolution, authorization, and rate limiting.
- Ingestion parsing, redaction policy, provenance, and deduplication.
- Score and coverage calculations, rubric versioning, and trend calculations.
- Recommendation eligibility, time fit, review scheduling, and final state transitions.
- Proof classification supplied by trusted systems.
- CI status, test results, accepted submissions, and other validator outcomes.
- Database writes, transactions, migrations, idempotency, and audit records.
- Approval state, expiry, exact destination, and side-effect execution.
- Citation validation and memory eligibility.
- Vercel production schedules.

### Good Hermes work

- Explain why a deterministic recommendation matters.
- Review a bounded proof bundle and identify missing validation.
- Ask a tailored reflection or retrieval question.
- Synthesize repeated mistakes and candidate lessons.
- Draft a reusable skill or memory candidate for approval.
- Summarize a week using cited qualified loops.
- Compare alternative ways to prove the same target skill.
- Conduct a read-only, source-linked monthly portfolio audit.

### Prohibited initially

- Marking proof verified or a skill mastered.
- Changing scores, goals, rubric weights, or learning state.
- Writing memory without approval.
- Publishing content or sending messages beyond configured review delivery.
- Creating GitHub, GitLab, or Linear records.
- Merging, deploying, applying for jobs, or contacting people.
- Direct database credentials, unrestricted shell access, or recursive delegation.

## 13. Delivery Roadmap

The roadmap uses exit gates, not calendar promises.

### Release 0: Honest and attributable

Outcome: existing product stops making claims stronger than its evidence.

- Rename user-facing readiness/rank language to Evidence Coverage.
- Add identity aliases and persist GitHub PR authors.
- Classify personal, repository-context, and unknown attribution.
- Mark current DSA solves as self-attested.
- Contain first-person career drafts until attribution is verified.
- Add narrow exclude, restore, correct, and delete controls.

Exit gate:

- No unverified collaborator activity increases personal coverage.
- No first-person claim is export-ready without approved attribution.
- Every visible evidence item shows source, attribution, and proof level.
- Excluded evidence disappears from coverage and recommendations.

### Release 1: Deterministic Today

Outcome: one complete private loop works without an AI provider.

- Add active focus, default time budget, and simple constraints.
- Add the `learning_runs` lifecycle and proof contract.
- Rank one action deterministically.
- Support accept, start, partial, blocked, defer, reject, and swap.
- Capture proof, actual minutes, difficulty fit, and one lesson.
- Add correction and undo.
- Add deterministic delayed review scheduling.

Exit gate:

- Today works with all AI, embedding, search, and memory-provider keys absent.
- The recommendation never exceeds the selected budget.
- Completion cannot qualify without proof classification and a lesson.
- Duplicate submissions are idempotent.
- A failed review replans without deleting prior proof or breaking a streak.

### Release 2: Intent-based hub

Outcome: the private product feels centralized rather than dashboard-driven.

- Introduce Today, Progress, Evidence, Library, and Settings navigation.
- Move source dashboards under evidence/project drill-downs.
- Add the trace rail to Today and Progress.
- Add mobile proof capture and resumable partial attempts.
- Show source health and privacy state in Settings.

Exit gate:

- Desktop and mobile can complete the qualified loop end to end.
- Every score/coverage lane drills into its evidence.
- No top-level page requires knowledge of an integration name to decide what to do.

### Release 3: Native Hermes read-only pilot

Outcome: native Hermes adds useful review without becoming a source of truth.

- Install and verify native Hermes on the target machine.
- Create a dedicated DevRank Hermes profile.
- Enable memory and skill write approval.
- Add project-local DevRank skills.
- Build the read-only DevRank MCP bridge.
- Add `agent_runs` and deterministic output evaluation.
- Pilot `devrank-proof-reviewer` first.

Exit gate:

- Thirty adversarial fixtures cover missing proof, contradictory proof, prompt
  injection, secrets, invalid citations, and oversized inputs.
- Every output is schema-valid and every citation resolves to the supplied bundle.
- The pilot has no mutation or side-effect path.
- At least 70% of the first 20 real reviews are accepted without factual correction.
- Median review latency is under 10 seconds and cost is below the configured cap.
- Below 50% acceptance after iteration means the AI reviewer is removed in favor
  of a deterministic reflection template.

### Release 4: Review, approved memory, and on-the-go

Outcome: lessons return when useful and the loop continues away from the desktop.

- Add weekly review over qualified loops and delayed-review results.
- Add `devrank-learning-coach` and `devrank-weekly-review` skills.
- Let Hermes propose a compact memory or skill update.
- Require explicit memory and skill approval.
- Connect one gateway channel for mobile continuation.
- Use Hermes cron only for a due-review or weekly-review delivery; Vercel remains
  the canonical scheduler and database writer.

Exit gate:

- Disabling Hermes leaves Today and review scheduling functional.
- Every Hermes call has a receipt and can be discarded.
- Every durable memory or skill update shows a diff and approval.
- Gateway authorization is fail-closed and allowlisted.
- Provider failure cannot change evidence, plans, or review state.

### Release 5: Agent Portfolio

Outcome: the user can inspect whether the agent is improving.

- Show native Hermes and DevRank agent runs together by stable links, not copied transcripts.
- Track skill version, use count, success, correction, and last validation.
- Track memory candidates, approvals, rejections, and later usefulness.
- Show repeated agent failures and recovered workflows.
- Link Hermes Journey nodes to DevRank lessons where the user approved the relationship.
- Add the `devrank-agent-curator` skill as proposal-only.

Exit gate:

- Every displayed agent improvement links to a run, correction, or approved lesson.
- The user can reject or archive an agent memory or skill without editing files manually.
- Agent quality trends exclude raw token volume and conversation count.

### Release 6: Evaluated expansion

Outcome: add only capabilities proven necessary by real usage.

- Evaluate pgvector against a labeled retrieval fixture.
- Evaluate one external Hermes memory provider against a documented use case.
- Add read-only monthly subagent portfolio audits if single-agent reviews are stable.
- Add previewed write proposals only after a concrete need, approval boundary,
  idempotency, and rollback behavior exist.

Exit gate:

- Every expansion passes a written value hypothesis, privacy review, failure plan,
  cost cap, and kill-switch test.

## 14. Ordered Epics

| # | Epic | Depends on | Main repository touchpoints | Size |
| ---: | --- | --- | --- | --- |
| 1 | Evidence Coverage language and versioning | none | `packages/scoring`, dashboard copy, docs | M |
| 2 | Identity aliases and GitHub attribution | none | `packages/github`, `packages/db`, Settings | L |
| 3 | Evidence proof and inclusion controls | 2 | shared types, DB migration/repositories, Evidence UI | L |
| 4 | Career-claim containment | 2, 3 | `packages/db/src/career-content.ts`, career UI | M |
| 5 | Learning-run schema and lifecycle | 3 | DB migration, domain repository, shared types | L |
| 6 | Focus, time budget, and deterministic ranking | 5 | planner, Today server services, Settings | L |
| 7 | Today action and decision feedback | 5, 6 | new Today route/components/actions | L |
| 8 | Proof, lesson, correction, and undo | 3, 5, 7 | Today flow, evidence service, validators | L |
| 9 | Fixed delayed reviews and qualified-loop metric | 5, 8 | scheduler, Progress, tests | M |
| 10 | Intent-based private navigation | 7, 8 | dashboard layout, Progress/Evidence/Library/Settings | L |
| 11 | Native Hermes hardened profile | 3 | setup docs, `.hermes/skills`, operating policy | M |
| 12 | Read-only DevRank MCP bridge | 5, 11 | new bridge app/package, narrow services, auth | L |
| 13 | Proof-review skill and agent run ledger | 8, 12 | `.hermes/skills`, DB migration, evaluator | L |
| 14 | Weekly review, approved memory, and gateway | 9, 13 | Hermes skills/config, review UI, gateway runbook | L |
| 15 | Agent Portfolio and curator | 13, 14 | agent dashboard, skill/memory links, evaluator | L |
| 16 | Semantic/external memory gate | 15 and measured need | context package, pgvector, one Hermes provider | L |
| 17 | Bounded delegation and write proposals | 15 and proven read-only value | Hermes delegation, approval actions, audit | XL |

Only epics 1-10 define the complete non-AI product. Epics 11-15 integrate most
of Hermes where it creates user value. Epics 16-17 are evidence-gated, not assumed.

## 15. Metrics

### North star

**Reviewed Proof Loops per Week**, capped at five.

A loop counts when:

1. One focus-relevant, time-budgeted action was attempted.
2. The attempt has classified, attributable proof.
3. The owner recorded one reusable lesson.
4. The first scheduled review was completed within seven days.
5. The record is not excluded, duplicated, or generated only from scoring/content activity.

A failed review still counts if it creates a correction or explicit replan. This
metric rewards learning cycles rather than easy successes or task volume.

### Leading measures

- Recommendation acceptance, swap, rejection, and defer rates by reason.
- Planned versus actual duration error.
- Percentage of completions with machine-observed or externally verified proof.
- Time from opening Today to selecting an action.
- Seven-day review completion and retrieval success.
- Percentage of lessons reused in a later action or approved agent memory.
- Hermes review acceptance without factual correction.

### Guardrails

- Zero unapproved external writes or sensitive-data incidents.
- 100% provenance completeness for recommendations and first-person claims.
- At least 90% of accepted actions fit the selected time budget.
- Duplicate or derived evidence cannot increase Evidence Coverage.
- Recommendation correction due to misattribution, irrelevance, or duplication
  must decline release over release.

### Lagging outcomes

- Goal completion.
- Reduction in repeated mistakes.
- Growth in independently verified work.
- Interview-stage progression and offers when the user is actively job seeking.

Opportunity outcomes validate the system but do not become causal claims.

## 16. Initial Experiments

| Experiment | Hypothesis | Success condition |
| --- | --- | --- |
| One primary action versus current task list | Less choice increases qualified completion | More reviewed proof loops without more budget violations |
| Evidence Coverage wording versus Readiness | Honest language improves interpretation and trust | Fewer false-competence interpretations without lower action rate |
| Fixed seven-day review | Delayed retrieval creates more reusable learning than same-day completion | Higher later recall and lower repeated-error rate |
| Structured reflection versus Hermes review | Hermes earns its cost only if it improves lesson quality | Better acceptance, later reuse, or review performance |
| Proof contract shown before work | Knowing the required artifact improves proof quality | Higher qualified-proof rate and fewer corrections |
| Mobile gateway continuation | On-the-go follow-up reduces abandoned reviews | Higher due-review completion without notification opt-outs |

## 17. Security And Approval Gates

### Native Hermes configuration baseline

- Dedicated profile and home directory.
- `memory.write_approval: true`.
- `skills.write_approval: true`.
- `approvals.mode: manual` during the pilot.
- `cron_mode: deny` and `unattended_mode: deny` for dangerous commands.
- Explicit gateway user allowlist or DM pairing; never allow all users.
- No `--yolo` for DevRank sessions.
- DevRank MCP `tools.include` lists only approved read tools.
- No database URL, service-role key, or source-provider write token in Hermes tools.
- External memory disabled initially.

### Before any write tool

- Exact payload and destination preview.
- Approval scoped to one action, destination, and expiry.
- Idempotency key and external receipt.
- Rollback for reversible actions.
- Global kill switch.
- Injection fixtures for repository, issue, transcript, and recalled-memory content.
- User-regret and reversal metric.

Automatic publishing, applications, recruiter messages, merges, production
changes, and destructive data operations remain prohibited.

## 18. Risks And Mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Coverage is mistaken for competence | High | Rename immediately, show evidence composition, defer mastery claims |
| Collaborator work is credited to the owner | Critical for claims | Persist authors, configure identities, classify unknown activity |
| Dashboard redesign becomes a visual-only rewrite | High | Implement learning lifecycle and proof model before navigation |
| Native Hermes duplicates existing provider workflows | Medium | Define runtime boundary; keep server adapter only for bounded fallbacks |
| Memory becomes a second untrusted source of truth | High | Postgres canonical, approvals, citations, correction and delete |
| External memory creates split-brain data | High | One provider only; local receipts; disable direct duplicate writes |
| Agent infrastructure delays user value | High | Deterministic Today ships before MCP, ledgers, or external memory |
| Daily plan overload continues | High | One action, budget cap, one optional due review |
| Streaks punish interruptions | Medium | Replan without penalty; keep north star internal |
| AI invents evidence or citations | High | Bounded proof bundles, schemas, citation allowlist, fail closed |
| Mobile alerts become noise | Medium | One channel, due-only delivery, easy pause, no engagement pressure |
| Multi-user expectations leak into solo design | Medium | Document single-owner scope; tenant isolation is a separate release gate |

## 19. Deferred And Rejected Work

Do not build yet:

- New evidence-source integrations.
- Public rankings, social feeds, or employer views.
- Automatic resume, LinkedIn, X, or portfolio publication.
- Hireability, salary, or interview-probability predictions.
- Full mastery graphs, Bayesian tracing, personalized forgetting curves, or item-response models.
- Autonomous market-research loops.
- Multi-agent swarms for daily planning.
- A generic orchestration DAG or approval platform.
- A separate vector database.
- Full transcript synchronization to an external provider.
- Multi-user accounts or organization support.

Reconsider richer mastery only after at least 50 qualified loops across six weeks
show a decision that the four-state learning model cannot make. Reconsider
external memory only at the gate in section 10.

## 20. Repository Evidence

| Finding | Repository reference |
| --- | --- |
| Product currently promises evidence-backed scores, plans, and mentor summaries | `README.md` |
| Eight private dashboard pages exist | `apps/web/app/dashboards/**/page.tsx` |
| Current lane score is `60 + 8 * evidence count`, capped at 100 | `packages/scoring/src/index.ts` |
| Scoring uses keyword matches over title and summary | `packages/scoring/src/rubrics.ts` |
| Dashboard calls scores Skill Rank/readiness | `apps/web/app/dashboards/page.tsx` |
| Single-user owner is deployment configuration | `packages/shared/src/owner.ts` |
| GitHub pull-request summary has no author | `packages/github/src/types.ts` |
| GitHub backfill imports all repository PRs | `packages/github/src/backfill.ts` |
| Career drafts currently use Built, Delivered, and Shipped | `packages/db/src/career-content.ts` |
| DSA completion is self-attested and asserts reviewed complexity | `apps/web/app/dashboards/dsa/actions.ts` |
| Local raw upload and embeddings default off | `apps/local-agent/src/config.ts` |
| Current context layer supports Supabase and Supermemory | `packages/context/src/index.ts` |
| Supabase context search is lexical and post-filters container tags | `packages/context/src/supabase.ts` |
| `@repo/hermes` has no native Hermes runtime dependency | `packages/hermes/package.json` |
| Existing Hermes adapter bounds, redacts, and wraps provider prompts | `packages/hermes/src/provider.ts` |
| Native Hermes installation and skills remain unchecked | `Task.md`, section 8 |
| GitLab integration is bounded and read-only | `packages/gitlab/src/backfill.ts` |

## 21. Official Hermes Sources

Verified on 2026-09-09:

- Project overview: <https://github.com/NousResearch/hermes-agent>
- Architecture: <https://hermes-agent.nousresearch.com/docs/developer-guide/architecture>
- Persistent memory and write approval: <https://hermes-agent.nousresearch.com/docs/user-guide/features/memory>
- Memory providers: <https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers>
- Skills and skill write approval: <https://hermes-agent.nousresearch.com/docs/user-guide/features/skills>
- MCP and per-server tool filtering: <https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp>
- Security and approvals: <https://hermes-agent.nousresearch.com/docs/user-guide/security>
- Cron and execution history: <https://hermes-agent.nousresearch.com/docs/user-guide/features/cron>

Hermes changes quickly. Pin and record the installed Hermes version before
implementation, then re-check these pages and local runtime help for every
integration that depends on native behavior.

## 22. Definition Of Complete

The centralized hub vision is complete when:

- The owner opens one private Today experience on desktop or mobile.
- One action fits the selected focus and available time.
- The recommendation explains itself with real evidence.
- The user can attempt, prove, reflect, correct, and review without leaving the loop.
- Progress shows retained proof and lessons instead of activity theater.
- Hermes can discuss the same canonical records through read-only tools.
- Hermes memory and skills change only through visible approval.
- The Agent Portfolio shows whether Hermes is becoming more reliable.
- External AI or memory failure never blocks the deterministic product.
- Every claim remains attributable, inspectable, correctable, and reversible.
