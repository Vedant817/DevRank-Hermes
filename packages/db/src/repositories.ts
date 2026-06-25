import { createHash } from "node:crypto";
import {
  ConfigurationError,
  MEMORY_EMBEDDING_DIMENSIONS,
  type DailyPlan,
  type EvidenceItem,
  type EvidenceSource,
  type ScoreBreakdown,
  type ScoreSnapshot,
  type WeeklyPlan,
} from "@repo/shared";
import type { SqlClient } from "./client.js";
import { runInTransaction } from "./client.js";
import {
  listGithubCommitEvidence,
  listGithubPullRequestEvidence,
  listGithubRepoEvidence,
  type GithubPullRequestTarget,
} from "./github.js";

export interface PersistableLinearProject {
  id: string;
  name: string;
  state: string | null;
  progress: number | null;
  url: string | null;
  teamKey?: string | null;
  teamId?: string | null;
  teamName: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  workspaceUrlKey?: string | null;
}

export interface PersistableLinearIssue {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string;
  state: string | null;
  assignee: string | null;
  projectId: string | null;
  teamKey?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  updatedAt?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  workspaceUrlKey?: string | null;
}

export interface PersistableLinearBackfill {
  projects: PersistableLinearProject[];
  issues: PersistableLinearIssue[];
}

export interface PersistableEvidenceEmbedding {
  embedding: number[];
  model: string;
  source: EvidenceSource;
  sourceId: string;
}

export interface PersistableAiChatSession {
  agentName: string;
  messages: Array<{
    content: string;
    createdAt?: string;
    role: string;
  }>;
  rawStored: boolean;
  skillTags: string[];
  source: EvidenceSource;
  sourceId: string;
  sourcePath?: string;
  startedAt?: string;
  summary: string;
  title: string;
}

export interface SlackNotificationAttempt {
  channel?: string;
  deliveryKey?: string;
  response?: Record<string, unknown>;
  text: string;
}

export interface SlackNotificationClaim {
  claimed: boolean;
  id: string;
  status: "delivered" | "failed" | "pending";
}

export interface GithubWebhookDelivery {
  action?: string;
  deliveryId: string;
  event: string;
}

export interface LinearWebhookDelivery {
  action?: string;
  deliveryId: string;
  eventType?: string;
  webhookTimestamp?: string;
}

type MemoryItemRow = {
  id: string;
  source: string;
  source_id: string | null;
  title: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
};

type ScoreSnapshotRow = {
  overall: string | number;
  breakdown: ScoreBreakdown[] | string;
  created_at: Date | string;
  rubric_version: string;
};

type DashboardSourceRow = {
  source: string;
  count: string | number;
};

type DashboardCountsRow = {
  github_commits: string | number;
  github_repos: string | number;
  github_pull_requests: string | number;
  linear_projects: string | number;
  linear_issues: string | number;
  slack_notifications: string | number;
};

type DailyPlanRow = {
  plan_date: Date | string;
  target_minutes: number;
  tasks: DailyPlan["tasks"] | string;
  created_at: Date | string;
};

export type WeeklyPlanRow = {
  week_start: Date | string;
  weekly_goal: string;
  target_minutes: number;
  tasks: WeeklyPlan["tasks"] | string;
  generated_at: Date | string;
  created_at: Date | string;
};

export type DailyTaskRow = {
  plan_date: Date | string;
  task_key: string;
  category: DailyPlan["tasks"][number]["category"];
  title: string;
  minutes: number;
  evidence: string | null;
  status: DailyTaskStatus;
  completed_at: Date | string | null;
  notes: string | null;
  evidence_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type IngestionRunRow = {
  source: string;
  status: string;
  summary: string | null;
  error: string | null;
  finished_at: Date | string | null;
};

type LinearProjectEvidenceRow = {
  id: string;
  name: string;
  state: string | null;
  progress: string | number | null;
  url: string | null;
  synced_at: Date | string;
};

type LinearIssueEvidenceRow = {
  id: string;
  identifier: string;
  title: string;
  state: string | null;
  priority: number | null;
  assignee: string | null;
  url: string | null;
  synced_at: Date | string;
};

type LinearPlanningIssueRow = {
  identifier: string;
  title: string;
  state: string | null;
  priority: number | null;
  url: string | null;
};

export interface LinearSyncRunStatus {
  error?: string | null;
  finishedAt?: string | null;
  source: string;
  status: string;
  summary?: string | null;
}

export interface LinearSyncHealth {
  error?: string;
  finishedAt?: string;
  message: string;
  source?: string;
  status: "failed" | "healthy" | "unknown";
  summary?: string;
}

export interface LinearPlanningSignal {
  issue?: {
    identifier: string;
    priority: number | null;
    state: string | null;
    title: string;
    url: string | null;
  };
  syncHealth: LinearSyncHealth;
}

export type ScoringEvidenceScope = "all" | "user" | "repo" | "pull_request";

export type DailyTaskStatus = "pending" | "completed" | "skipped";

export interface DailyTaskRecord {
  planDate: string;
  taskKey: string;
  category: DailyPlan["tasks"][number]["category"];
  title: string;
  minutes: number;
  status: DailyTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  evidence?: string;
  evidenceUrl?: string;
  notes?: string;
}

export interface DailyTaskStatusUpdate {
  completedAt?: string;
  date: string;
  evidenceUrl?: string;
  notes?: string;
  status: DailyTaskStatus;
  taskKey: string;
}

export interface DashboardSummary {
  counts: {
    evidenceItems: number;
    githubPullRequests: number;
    githubCommits: number;
    githubRepos: number;
    linearIssues: number;
    linearProjects: number;
    slackNotifications: number;
  };
  evidenceBySource: Array<{
    count: number;
    source: string;
  }>;
  latestDailyPlan?: DailyPlan & {
    createdAt: string;
  };
  latestIngestionRuns: Array<{
    error?: string;
    finishedAt?: string;
    source: string;
    status: string;
    summary?: string;
  }>;
  latestScoreSnapshot?: ScoreSnapshot;
}

export async function insertScoreSnapshot(
  sql: SqlClient,
  snapshot: ScoreSnapshot,
): Promise<void> {
  const breakdownJson = JSON.stringify(snapshot.breakdown);

  await sql`
    insert into score_snapshots (overall, breakdown, rubric_version, created_at)
    values (
      ${snapshot.overall},
      ${breakdownJson}::jsonb,
      ${snapshot.rubricVersion},
      ${snapshot.generatedAt}
    )
  `;
}

export async function getLatestScoreSnapshot(
  sql: SqlClient,
): Promise<ScoreSnapshot | undefined> {
  const rows = await sql<ScoreSnapshotRow[]>`
    select overall, breakdown, rubric_version, created_at
    from score_snapshots
    order by created_at desc
    limit 1
  `;

  const row = rows[0];

  return row ? scoreSnapshotFromRow(row) : undefined;
}

export async function getRecentScoreSnapshots(
  sql: SqlClient,
  limit = 20,
): Promise<ScoreSnapshot[]> {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.floor(limit), 100))
    : 20;
  const rows = await sql<ScoreSnapshotRow[]>`
    select overall, breakdown, rubric_version, created_at
    from score_snapshots
    order by created_at desc
    limit ${boundedLimit}
  `;

  return rows.map(scoreSnapshotFromRow);
}

export async function getDashboardSummary(sql: SqlClient): Promise<DashboardSummary> {
  const [scoreSnapshot, sourceRows, countRows, planRows, ingestionRows] = await Promise.all([
    getLatestScoreSnapshot(sql),
    sql<DashboardSourceRow[]>`
      select source, count(*) as count
      from memory_items
      group by source
      order by source
    `,
    sql<DashboardCountsRow[]>`
      select
        (select count(*) from github_repos) as github_repos,
        (select count(*) from github_pull_requests) as github_pull_requests,
        (select count(*) from github_commits) as github_commits,
        (select count(*) from linear_projects) as linear_projects,
        (select count(*) from linear_issues) as linear_issues,
        (select count(*) from slack_notifications) as slack_notifications
    `,
    sql<DailyPlanRow[]>`
      select plan_date, tasks, target_minutes, created_at
      from daily_plans
      order by created_at desc
      limit 1
    `,
    sql<IngestionRunRow[]>`
      select source, status, summary, error, finished_at
      from ingestion_runs
      order by started_at desc
      limit 6
    `,
  ]);
  const counts = countRows[0];
  const latestDailyPlan = planRows[0] ? dailyPlanFromRow(planRows[0]) : undefined;

  return {
    counts: {
      evidenceItems: sourceRows.reduce((total, row) => total + Number(row.count), 0),
      githubCommits: numberCount(counts?.github_commits),
      githubPullRequests: numberCount(counts?.github_pull_requests),
      githubRepos: numberCount(counts?.github_repos),
      linearIssues: numberCount(counts?.linear_issues),
      linearProjects: numberCount(counts?.linear_projects),
      slackNotifications: numberCount(counts?.slack_notifications),
    },
    evidenceBySource: sourceRows.map((row) => ({
      count: Number(row.count),
      source: row.source,
    })),
    latestDailyPlan,
    latestIngestionRuns: ingestionRows.map((row) => ({
      source: row.source,
      status: row.status,
      ...(row.summary ? { summary: row.summary } : {}),
      ...(row.error ? { error: row.error } : {}),
      ...(row.finished_at ? { finishedAt: toIso(row.finished_at) } : {}),
    })),
    latestScoreSnapshot: scoreSnapshot,
  };
}

export async function getHighestPriorityLinearPlanningIssue(
  sql: SqlClient,
): Promise<{
  identifier: string;
  priority: number | null;
  state: string | null;
  title: string;
  url: string | null;
} | undefined> {
  const rows = await sql<LinearPlanningIssueRow[]>`
    select identifier, title, state, priority, url
    from linear_issues
    where coalesce(state, '') !~* '^(done|completed|canceled|cancelled)$'
    order by
      case when coalesce(state, '') ilike '%block%' then 0 else 1 end,
      case priority
        when 1 then 0
        when 2 then 1
        when 3 then 2
        when 4 then 3
        else 4
      end,
      synced_at desc
    limit 1
  `;

  return rows[0];
}

export async function getLinearPlanningSignal(
  sql: SqlClient,
): Promise<LinearPlanningSignal> {
  const [issue, syncRows] = await Promise.all([
    getHighestPriorityLinearPlanningIssue(sql),
    sql<IngestionRunRow[]>`
      select source, status, summary, error, finished_at
      from ingestion_runs
      where source in ('linear_backfill', 'linear_webhook')
      order by coalesce(finished_at, started_at) desc
      limit 1
    `,
  ]);

  return {
    ...(issue ? { issue } : {}),
    syncHealth: buildLinearSyncHealth(syncRows[0] ? ingestionRunStatusFromRow(syncRows[0]) : undefined),
  };
}

export function buildLinearSyncHealth(run?: LinearSyncRunStatus): LinearSyncHealth {
  if (!run) {
    return {
      status: "unknown",
      message: "No Linear sync run has been recorded yet.",
    };
  }

  const source = safeOperationalText(run.source);
  const finishedAt = run.finishedAt ? safeOperationalText(run.finishedAt) : undefined;
  const summary = run.summary ? safeOperationalText(run.summary) : undefined;
  const error = run.error ? safeOperationalText(run.error) : undefined;

  if (run.status === "failed") {
    return {
      status: "failed",
      message: "Latest Linear sync failed. Fix Linear backfill or webhook delivery before relying on project planning.",
      ...(source ? { source } : {}),
      ...(finishedAt ? { finishedAt } : {}),
      ...(summary ? { summary } : {}),
      ...(error ? { error } : {}),
    };
  }

  if (run.status === "success") {
    return {
      status: "healthy",
      message: "Latest Linear sync completed successfully.",
      ...(source ? { source } : {}),
      ...(finishedAt ? { finishedAt } : {}),
      ...(summary ? { summary } : {}),
    };
  }

  return {
    status: "unknown",
    message: "Latest Linear sync status is not recognized.",
    ...(source ? { source } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(summary ? { summary } : {}),
    ...(error ? { error } : {}),
  };
}

export async function insertDailyPlan(
  sql: SqlClient,
  plan: DailyPlan,
): Promise<void> {
  await runInTransaction(sql, async (transaction) => {
    await persistDailyPlan(transaction, plan);
  });
}

async function persistDailyPlan(
  sql: SqlClient,
  plan: DailyPlan,
): Promise<void> {
  const tasksJson = JSON.stringify(plan.tasks);
  const taskKeys = plan.tasks.map((task) => dailyTaskKey(plan.date, task));

  await sql`
    insert into daily_plans (plan_date, tasks, target_minutes)
    values (${plan.date}, ${tasksJson}::jsonb, ${plan.targetMinutes})
    on conflict (plan_date) do update set
      tasks = excluded.tasks,
      target_minutes = excluded.target_minutes
  `;

  if (taskKeys.length > 0) {
    await sql`
      delete from daily_tasks
      where plan_date = ${plan.date}
        and task_key <> all(${taskKeys})
    `;
  } else {
    await sql`
      delete from daily_tasks
      where plan_date = ${plan.date}
    `;
  }

  for (const [index, task] of plan.tasks.entries()) {
    await sql`
      insert into daily_tasks (
        plan_date,
        task_key,
        category,
        title,
        minutes,
        evidence,
        status,
        updated_at
      )
      values (
        ${plan.date},
        ${taskKeys[index] ?? dailyTaskKey(plan.date, task)},
        ${task.category},
        ${task.title},
        ${task.minutes},
        ${task.evidence ?? null},
        'pending',
        now()
      )
      on conflict (plan_date, task_key) do update set
        category = excluded.category,
        title = excluded.title,
        minutes = excluded.minutes,
        evidence = excluded.evidence,
        updated_at = now()
    `;
  }
}

export async function insertWeeklyPlan(
  sql: SqlClient,
  plan: WeeklyPlan,
): Promise<void> {
  const tasksJson = JSON.stringify(plan.tasks);

  await sql`
    insert into weekly_plans (
      week_start,
      weekly_goal,
      tasks,
      target_minutes,
      generated_at
    )
    values (
      ${plan.weekStart},
      ${plan.weeklyGoal},
      ${tasksJson}::jsonb,
      ${plan.targetMinutes},
      ${plan.generatedAt}
    )
    on conflict (week_start) do update set
      weekly_goal = excluded.weekly_goal,
      tasks = excluded.tasks,
      target_minutes = excluded.target_minutes,
      generated_at = excluded.generated_at
  `;
}

export async function updateDailyTaskStatus(
  sql: SqlClient,
  input: DailyTaskStatusUpdate,
): Promise<DailyTaskRecord | undefined> {
  const completedAt = input.status === "completed" ? input.completedAt ?? new Date().toISOString() : null;
  const rows = await sql<DailyTaskRow[]>`
    update daily_tasks
    set
      status = ${input.status},
      completed_at = ${completedAt},
      notes = ${input.notes ?? null},
      evidence_url = ${input.evidenceUrl ?? null},
      updated_at = now()
    where plan_date = ${input.date}
      and task_key = ${input.taskKey}
    returning
      plan_date,
      task_key,
      category,
      title,
      minutes,
      evidence,
      status,
      completed_at,
      notes,
      evidence_url,
      created_at,
      updated_at
  `;

  return rows[0] ? dailyTaskFromRow(rows[0]) : undefined;
}

export async function createSlackNotificationAttempt(
  sql: SqlClient,
  input: SlackNotificationAttempt,
): Promise<string> {
  const responseJson = JSON.stringify(input.response ?? { status: "pending" });
  const rows = await sql<{ id: string }[]>`
    insert into slack_notifications (
      delivery_key,
      channel,
      text,
      status,
      claimed_at,
      delivered_at,
      response
    )
    values (
      ${input.deliveryKey ?? null},
      ${input.channel ?? null},
      ${input.text},
      'pending',
      now(),
      null,
      ${responseJson}::jsonb
    )
    returning id::text
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Slack notification audit insert returned no id.");
  }

  return row.id;
}

export async function claimSlackNotificationAttempt(
  sql: SqlClient,
  input: SlackNotificationAttempt & { deliveryKey: string },
): Promise<SlackNotificationClaim> {
  const responseJson = JSON.stringify(input.response ?? { status: "pending" });
  const claimedRows = await sql<{
    id: string;
    status: SlackNotificationClaim["status"];
  }[]>`
    insert into slack_notifications (
      delivery_key,
      channel,
      text,
      status,
      claimed_at,
      delivered_at,
      response
    )
    values (
      ${input.deliveryKey},
      ${input.channel ?? null},
      ${input.text},
      'pending',
      now(),
      null,
      ${responseJson}::jsonb
    )
    on conflict (delivery_key)
      where delivery_key is not null
    do update set
      channel = excluded.channel,
      text = excluded.text,
      status = 'pending',
      claimed_at = now(),
      delivered_at = null,
      response = excluded.response
    where slack_notifications.status = 'failed'
      or (
        slack_notifications.status = 'pending'
        and slack_notifications.claimed_at < now() - interval '10 minutes'
      )
    returning id::text, status
  `;
  const claimed = claimedRows[0];

  if (claimed) {
    return {
      claimed: true,
      id: claimed.id,
      status: claimed.status,
    };
  }

  const existingRows = await sql<{
    id: string;
    status: SlackNotificationClaim["status"];
  }[]>`
    select id::text, status
    from slack_notifications
    where delivery_key = ${input.deliveryKey}
    limit 1
  `;
  const existing = existingRows[0];

  if (!existing) {
    throw new Error("Slack notification claim conflicted but no existing delivery was found.");
  }

  return {
    claimed: false,
    id: existing.id,
    status: existing.status,
  };
}

export async function markSlackNotificationDelivered(
  sql: SqlClient,
  input: {
    deliveredAt: string;
    id: string;
    response?: Record<string, unknown>;
  },
): Promise<void> {
  const responseJson = JSON.stringify(input.response ?? { status: "delivered" });

  await sql`
    update slack_notifications
    set
      status = 'delivered',
      delivered_at = ${input.deliveredAt},
      response = ${responseJson}::jsonb
    where id = ${input.id}
  `;
}

export async function markSlackNotificationFailed(
  sql: SqlClient,
  input: {
    errorCode: string;
    id: string;
    response?: Record<string, unknown>;
  },
): Promise<void> {
  const responseJson = JSON.stringify({
    ...(input.response ?? {}),
    errorCode: input.errorCode,
    failedAt: new Date().toISOString(),
    status: "failed",
  });

  await sql`
    update slack_notifications
    set
      status = 'failed',
      response = ${responseJson}::jsonb
    where id = ${input.id}
  `;
}

export async function insertIngestionRun(
  sql: SqlClient,
  input: {
    source: string;
    status: "success" | "failed";
    summary?: string;
    error?: string;
  },
): Promise<void> {
  await sql`
    insert into ingestion_runs (source, status, summary, error, finished_at)
    values (${input.source}, ${input.status}, ${input.summary ?? null}, ${input.error ?? null}, now())
  `;
}

export async function claimGithubWebhookDelivery(
  sql: SqlClient,
  input: GithubWebhookDelivery,
): Promise<boolean> {
  const rows = await sql<{ delivery_id: string }[]>`
    insert into github_webhook_events (
      delivery_id,
      event,
      action,
      status,
      error,
      received_at,
      processed_at
    )
    values (
      ${input.deliveryId},
      ${input.event},
      ${input.action ?? null},
      'processing',
      null,
      now(),
      null
    )
    on conflict (delivery_id) do update set
      event = excluded.event,
      action = excluded.action,
      status = 'processing',
      error = null,
      received_at = now(),
      processed_at = null
    where github_webhook_events.status = 'failed'
      or (
        github_webhook_events.status = 'processing'
        and github_webhook_events.received_at < now() - interval '10 minutes'
      )
    returning delivery_id
  `;

  return rows.length > 0;
}

export async function markGithubWebhookDeliveryProcessed(
  sql: SqlClient,
  deliveryId: string,
): Promise<void> {
  await sql`
    update github_webhook_events
    set
      status = 'processed',
      error = null,
      processed_at = now()
    where delivery_id = ${deliveryId}
  `;
}

export async function markGithubWebhookDeliveryFailed(
  sql: SqlClient,
  deliveryId: string,
  error: string,
): Promise<void> {
  await sql`
    update github_webhook_events
    set
      status = 'failed',
      error = ${error},
      processed_at = now()
    where delivery_id = ${deliveryId}
  `;
}

export async function claimLinearWebhookDelivery(
  sql: SqlClient,
  input: LinearWebhookDelivery,
): Promise<boolean> {
  const rows = await sql<{ delivery_id: string }[]>`
    insert into linear_webhook_events (
      delivery_id,
      event_type,
      action,
      webhook_timestamp,
      status,
      error,
      received_at,
      processed_at
    )
    values (
      ${input.deliveryId},
      ${input.eventType ?? null},
      ${input.action ?? null},
      ${input.webhookTimestamp ?? null},
      'processing',
      null,
      now(),
      null
    )
    on conflict (delivery_id) do update set
      event_type = excluded.event_type,
      action = excluded.action,
      webhook_timestamp = excluded.webhook_timestamp,
      status = 'processing',
      error = null,
      received_at = now(),
      processed_at = null
    where linear_webhook_events.status = 'failed'
      or (
        linear_webhook_events.status = 'processing'
        and linear_webhook_events.received_at < now() - interval '10 minutes'
      )
    returning delivery_id
  `;

  return rows.length > 0;
}

export async function reclaimLinearWebhookDelivery(
  sql: SqlClient,
  input: LinearWebhookDelivery,
): Promise<boolean> {
  const rows = await sql<{ delivery_id: string }[]>`
    update linear_webhook_events
    set
      event_type = ${input.eventType ?? null},
      action = ${input.action ?? null},
      webhook_timestamp = ${input.webhookTimestamp ?? null},
      status = 'processing',
      error = null,
      received_at = now(),
      processed_at = null
    where delivery_id = ${input.deliveryId}
      and (
        status = 'failed'
        or (
          status = 'processing'
          and received_at < now() - interval '30 seconds'
        )
      )
    returning delivery_id
  `;

  return rows.length > 0;
}

export async function markLinearWebhookDeliveryProcessed(
  sql: SqlClient,
  deliveryId: string,
): Promise<void> {
  await sql`
    update linear_webhook_events
    set
      status = 'processed',
      error = null,
      processed_at = now()
    where delivery_id = ${deliveryId}
  `;
}

export async function markLinearWebhookDeliveryFailed(
  sql: SqlClient,
  deliveryId: string,
  error: string,
): Promise<void> {
  await sql`
    update linear_webhook_events
    set
      status = 'failed',
      error = ${error},
      processed_at = now()
    where delivery_id = ${deliveryId}
  `;
}

export async function upsertEvidenceItems(
  sql: SqlClient,
  evidence: EvidenceItem[],
): Promise<number> {
  let written = 0;

  for (const item of evidence) {
    const metadataJson = JSON.stringify({
      ...item.metadata,
      occurredAt: item.occurredAt,
      url: item.url,
    });

    await sql`
      insert into memory_items (source, source_id, title, summary, metadata)
      values (
        ${item.source},
        ${item.id},
        ${item.title},
        ${item.summary},
        ${metadataJson}::jsonb
      )
      on conflict (source, source_id)
        where source_id is not null
      do update set
        title = excluded.title,
        summary = excluded.summary,
        metadata = excluded.metadata
    `;
    written += 1;
  }

  return written;
}

export async function upsertEvidenceEmbeddings(
  sql: SqlClient,
  embeddings: PersistableEvidenceEmbedding[],
): Promise<number> {
  let written = 0;

  for (const item of embeddings) {
    const vector = vectorLiteral(item.embedding);
    const rows = await sql<{ id: string }[]>`
      insert into memory_embeddings (memory_item_id, embedding, model, created_at)
      select id, ${vector}::vector, ${item.model}, now()
      from memory_items
      where source = ${item.source}
        and source_id = ${item.sourceId}
      on conflict (memory_item_id, model) do update set
        embedding = excluded.embedding,
        created_at = now()
      returning id
    `;

    written += rows.length;
  }

  return written;
}

export async function upsertAiChatSessions(
  sql: SqlClient,
  sessions: PersistableAiChatSession[],
): Promise<number> {
  let written = 0;

  for (const session of sessions) {
    const agentRows = await sql<{ id: string }[]>`
      insert into ai_agents (name, source)
      values (${session.agentName}, ${session.source})
      on conflict (name) do update set
        source = excluded.source
      returning id
    `;
    const agentId = agentRows[0]?.id;

    if (!agentId) {
      continue;
    }

    const sessionRows = await sql<{ id: string }[]>`
      insert into ai_sessions (
        agent_id,
        source_type,
        source_id,
        source_path,
        title,
        started_at,
        raw_stored
      )
      values (
        ${agentId},
        ${session.source},
        ${session.sourceId},
        ${session.sourcePath ?? null},
        ${session.title},
        ${session.startedAt ?? null},
        ${session.rawStored}
      )
      on conflict (source_type, source_id)
        where source_id is not null
      do update set
        agent_id = excluded.agent_id,
        source_path = excluded.source_path,
        title = excluded.title,
        started_at = excluded.started_at,
        raw_stored = excluded.raw_stored
      returning id
    `;
    const sessionId = sessionRows[0]?.id;

    if (!sessionId) {
      continue;
    }

    await sql`delete from ai_messages where session_id = ${sessionId}`;

    for (const message of session.messages) {
      if (message.createdAt) {
        await sql`
          insert into ai_messages (session_id, role, content, created_at)
          values (${sessionId}, ${message.role}, ${message.content}, ${message.createdAt})
        `;
      } else {
        await sql`
          insert into ai_messages (session_id, role, content)
          values (${sessionId}, ${message.role}, ${message.content})
        `;
      }
    }

    await sql`delete from ai_session_summaries where session_id = ${sessionId}`;
    await sql`
      insert into ai_session_summaries (session_id, summary, redaction_status, skill_tags)
      values (${sessionId}, ${session.summary}, 'passed', ${session.skillTags})
    `;
    written += 1;
  }

  return written;
}

export async function upsertLinearBackfill(
  sql: SqlClient,
  input: PersistableLinearBackfill,
): Promise<{
  issues: number;
  projects: number;
}> {
  const projectTeamIds = new Map(
    input.projects
      .filter((project) => project.teamId)
      .map((project) => [project.id, project.teamId as string]),
  );
  const workspaces = new Map<string, {
    name: string;
    urlKey: string | null;
  }>();
  const teams = new Map<string, {
    key: string | null;
    name: string;
    workspaceId: string | null;
  }>();

  for (const project of input.projects) {
    collectLinearWorkspace(workspaces, project);
    if (project.teamId && project.teamName) {
      collectLinearTeam(teams, workspaces, project.teamId, project.teamName, project.teamKey, project.workspaceId);
    }
  }

  for (const issue of input.issues) {
    collectLinearWorkspace(workspaces, issue);
    if (issue.teamId && issue.teamName) {
      collectLinearTeam(teams, workspaces, issue.teamId, issue.teamName, issue.teamKey, issue.workspaceId);
    }
  }

  let projects = 0;
  let issues = 0;

  for (const [id, workspace] of workspaces) {
    await sql`
      insert into linear_workspaces (id, name, url_key, synced_at)
      values (${id}, ${workspace.name}, ${workspace.urlKey}, now())
      on conflict (id) do update set
        name = excluded.name,
        url_key = coalesce(excluded.url_key, linear_workspaces.url_key),
        synced_at = now()
    `;
  }

  for (const [id, team] of teams) {
    await sql`
      insert into linear_teams (id, workspace_id, name, key, synced_at)
      values (${id}, ${team.workspaceId && workspaces.has(team.workspaceId) ? team.workspaceId : null}, ${team.name}, ${team.key}, now())
      on conflict (id) do update set
        workspace_id = coalesce(excluded.workspace_id, linear_teams.workspace_id),
        name = excluded.name,
        key = coalesce(excluded.key, linear_teams.key),
        synced_at = now()
    `;
  }

  for (const project of input.projects) {
    await sql`
      insert into linear_projects (
        id,
        team_id,
        name,
        state,
        progress,
        url,
        synced_at
      )
      values (
        ${project.id},
        (select id from linear_teams where id = ${project.teamId ?? null} limit 1),
        ${project.name},
        ${project.state},
        ${project.progress},
        ${project.url},
        now()
      )
      on conflict (id) do update set
        team_id = coalesce(excluded.team_id, linear_projects.team_id),
        name = excluded.name,
        state = excluded.state,
        progress = excluded.progress,
        url = excluded.url,
        synced_at = now()
    `;
    projects += 1;
  }

  for (const issue of input.issues) {
    const teamId = issue.teamId ?? (issue.projectId ? projectTeamIds.get(issue.projectId) : undefined) ?? null;

    await sql`
      insert into linear_issues (
        id,
        project_id,
        team_id,
        identifier,
        title,
        state,
        priority,
        assignee,
        url,
        updated_at,
        synced_at
      )
      values (
        ${issue.id},
        (select id from linear_projects where id = ${issue.projectId ?? null} limit 1),
        (select id from linear_teams where id = ${teamId} limit 1),
        ${issue.identifier},
        ${issue.title},
        ${issue.state},
        ${issue.priority},
        ${issue.assignee},
        ${issue.url},
        ${issue.updatedAt ?? null},
        now()
      )
      on conflict (id) do update set
        project_id = coalesce(excluded.project_id, linear_issues.project_id),
        identifier = excluded.identifier,
        title = excluded.title,
        state = excluded.state,
        priority = excluded.priority,
        assignee = excluded.assignee,
        team_id = coalesce(excluded.team_id, linear_issues.team_id),
        url = excluded.url,
        updated_at = coalesce(excluded.updated_at, linear_issues.updated_at),
        synced_at = now()
    `;
    issues += 1;
  }

  return {
    issues,
    projects,
  };
}

export async function deleteLinearEntities(
  sql: SqlClient,
  input: {
    issueIds: string[];
    projectIds: string[];
  },
): Promise<{
  issues: number;
  projects: number;
}> {
  let issues = 0;
  let projects = 0;

  for (const issueId of new Set(input.issueIds)) {
    const rows = await sql<{ id: string }[]>`
      delete from linear_issues
      where id = ${issueId}
      returning id
    `;

    issues += rows.length;
  }

  for (const projectId of new Set(input.projectIds)) {
    await sql`
      update linear_issues
      set project_id = null
      where project_id = ${projectId}
    `;
    const rows = await sql<{ id: string }[]>`
      delete from linear_projects
      where id = ${projectId}
      returning id
    `;

    projects += rows.length;
  }

  return { issues, projects };
}

function collectLinearWorkspace(
  workspaces: Map<string, { name: string; urlKey: string | null }>,
  input: {
    workspaceId?: string | null;
    workspaceName?: string | null;
    workspaceUrlKey?: string | null;
  },
) {
  if (!input.workspaceId || !input.workspaceName) {
    return;
  }

  const current = workspaces.get(input.workspaceId);

  workspaces.set(input.workspaceId, {
    name: input.workspaceName,
    urlKey: input.workspaceUrlKey ?? current?.urlKey ?? null,
  });
}

function collectLinearTeam(
  teams: Map<string, { key: string | null; name: string; workspaceId: string | null }>,
  workspaces: Map<string, { name: string; urlKey: string | null }>,
  id: string,
  name: string,
  key: string | null | undefined,
  workspaceId: string | null | undefined,
) {
  const current = teams.get(id);
  const knownWorkspaceId = workspaceId && workspaces.has(workspaceId)
    ? workspaceId
    : current?.workspaceId ?? null;

  teams.set(id, {
    key: key ?? current?.key ?? null,
    name,
    workspaceId: knownWorkspaceId,
  });
}

export async function listEvidenceItems(
  sql: SqlClient,
  options: {
    source?: EvidenceSource;
    limit?: number;
  } = {},
): Promise<EvidenceItem[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 500, 5_000));
  const rows = options.source
    ? await sql<MemoryItemRow[]>`
        select id::text, source, source_id, title, summary, metadata, created_at
        from memory_items
        where source = ${options.source}
        order by created_at desc
        limit ${limit}
      `
    : await sql<MemoryItemRow[]>`
        select id::text, source, source_id, title, summary, metadata, created_at
        from memory_items
        order by created_at desc
        limit ${limit}
      `;

  return rows.map(rowToEvidenceItem);
}

export async function listScoringEvidence(
  sql: SqlClient,
  options: {
    limit?: number;
    scope?: ScoringEvidenceScope;
    targetId?: string;
  } = {},
): Promise<EvidenceItem[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 500, 5_000));
  const scope = options.scope ?? "all";

  if (scope === "repo") {
    if (!options.targetId) {
      throw new Error("repo scoped scoring requires targetId.");
    }

    return [
      ...await listRepoMemoryEvidence(sql, options.targetId, limit),
      ...await listGithubRepoEvidence(sql, options.targetId, limit),
      ...await listGithubPullRequestEvidence(sql, { repoFullName: options.targetId }, limit),
      ...await listGithubCommitEvidence(sql, options.targetId, limit),
    ];
  }

  if (scope === "pull_request") {
    if (!options.targetId) {
      throw new Error("pull_request scoped scoring requires targetId.");
    }

    const target = parsePullRequestTarget(options.targetId);

    return [
      ...await listPullRequestMemoryEvidence(sql, target, limit),
      ...await listGithubPullRequestEvidence(sql, target, limit),
    ];
  }

  return [
    ...await listEvidenceItems(sql, { limit }),
    ...await listGithubRepoEvidence(sql, undefined, limit),
    ...await listGithubPullRequestEvidence(sql, {}, limit),
    ...await listGithubCommitEvidence(sql, undefined, limit),
    ...await listLinearProjectEvidence(sql, limit),
    ...await listLinearIssueEvidence(sql, limit),
  ];
}

function rowToEvidenceItem(row: MemoryItemRow): EvidenceItem {
  const metadata = row.metadata ?? {};
  const occurredAt = metadata.occurredAt;
  const url = metadata.url;
  const item: EvidenceItem = {
    id: row.source_id ?? row.id,
    source: row.source as EvidenceSource,
    title: row.title,
    summary: row.summary,
    occurredAt: typeof occurredAt === "string" ? occurredAt : toIso(row.created_at),
    metadata,
  };

  if (typeof url === "string") {
    item.url = url;
  }

  return item;
}

async function listRepoMemoryEvidence(sql: SqlClient, repoFullName: string, limit: number) {
  const rows = await sql<MemoryItemRow[]>`
    select id::text, source, source_id, title, summary, metadata, created_at
    from memory_items
    where source = 'github'
      and metadata->>'repository' = ${repoFullName}
    order by created_at desc
    limit ${limit}
  `;

  return rows.map(rowToEvidenceItem);
}

async function listPullRequestMemoryEvidence(
  sql: SqlClient,
  target: GithubPullRequestTarget,
  limit: number,
) {
  const rows = target.repoFullName
    ? await sql<MemoryItemRow[]>`
        select id::text, source, source_id, title, summary, metadata, created_at
        from memory_items
        where source = 'github'
          and metadata->>'repository' = ${target.repoFullName}
          and metadata->>'pullRequestNumber' = ${String(target.number)}
        order by created_at desc
        limit ${limit}
      `
    : await sql<MemoryItemRow[]>`
        select id::text, source, source_id, title, summary, metadata, created_at
        from memory_items
        where source = 'github'
          and metadata->>'pullRequestNumber' = ${String(target.number)}
        order by created_at desc
        limit ${limit}
      `;

  return rows.map(rowToEvidenceItem);
}

async function listLinearProjectEvidence(sql: SqlClient, limit: number): Promise<EvidenceItem[]> {
  const rows = await sql<LinearProjectEvidenceRow[]>`
    select id, name, state, progress, url, synced_at
    from linear_projects
    order by synced_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    id: `linear:project:${row.id}`,
    source: "linear",
    title: `Linear project: ${row.name}`,
    summary: [
      `Project ${row.name} is tracked in Linear.`,
      row.state ? `State: ${row.state}.` : "",
      row.progress !== null ? `Progress: ${Number(row.progress)}%.` : "",
    ].filter(Boolean).join(" "),
    occurredAt: toIso(row.synced_at),
    ...(row.url ? { url: row.url } : {}),
    metadata: {
      projectId: row.id,
      state: row.state,
      progress: row.progress,
      kind: "linear_project",
    },
  }));
}

async function listLinearIssueEvidence(sql: SqlClient, limit: number): Promise<EvidenceItem[]> {
  const rows = await sql<LinearIssueEvidenceRow[]>`
    select id, identifier, title, state, priority, assignee, url, synced_at
    from linear_issues
    order by priority desc, synced_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    id: `linear:issue:${row.id}`,
    source: "linear",
    title: `Linear issue ${row.identifier}: ${row.title}`,
    summary: [
      `Issue ${row.identifier} is tracked in Linear.`,
      row.state ? `State: ${row.state}.` : "",
      row.priority !== null ? `Priority: ${row.priority}.` : "",
      row.assignee ? `Assignee: ${row.assignee}.` : "",
    ].filter(Boolean).join(" "),
    occurredAt: toIso(row.synced_at),
    ...(row.url ? { url: row.url } : {}),
    metadata: {
      issueId: row.id,
      identifier: row.identifier,
      state: row.state,
      priority: row.priority,
      assignee: row.assignee,
      kind: "linear_issue",
    },
  }));
}

function parsePullRequestTarget(targetId: string): GithubPullRequestTarget {
  const trimmed = targetId.trim();
  const match = /^(?<repo>[^#]+)#(?<number>\d+)$/.exec(trimmed);

  if (match?.groups?.number) {
    return {
      repoFullName: match.groups.repo,
      number: Number(match.groups.number),
    };
  }

  const number = Number(trimmed);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error("pull_request targetId must be a PR number or owner/repo#number.");
  }

  return { number };
}

function dailyPlanFromRow(row: DailyPlanRow): DailyPlan & { createdAt: string } {
  const tasks =
    typeof row.tasks === "string"
      ? JSON.parse(row.tasks) as DailyPlan["tasks"]
      : row.tasks;

  return {
    date: row.plan_date instanceof Date ? row.plan_date.toISOString().slice(0, 10) : String(row.plan_date),
    targetMinutes: row.target_minutes,
    tasks,
    createdAt: toIso(row.created_at),
  };
}

function ingestionRunStatusFromRow(row: IngestionRunRow): LinearSyncRunStatus {
  return {
    source: row.source,
    status: row.status,
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.finished_at ? { finishedAt: toIso(row.finished_at) } : {}),
  };
}

export function dailyTaskKey(
  planDate: string,
  task: Pick<DailyPlan["tasks"][number], "category" | "title">,
): string {
  return createHash("sha256")
    .update(`${planDate}:${task.category}:${task.title}`)
    .digest("hex")
    .slice(0, 16);
}

export function dailyTaskFromRow(row: DailyTaskRow): DailyTaskRecord {
  return {
    planDate: row.plan_date instanceof Date ? row.plan_date.toISOString().slice(0, 10) : String(row.plan_date),
    taskKey: row.task_key,
    category: row.category,
    title: row.title,
    minutes: row.minutes,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.completed_at ? { completedAt: toIso(row.completed_at) } : {}),
    ...(row.evidence ? { evidence: row.evidence } : {}),
    ...(row.evidence_url ? { evidenceUrl: row.evidence_url } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
  };
}

export function weeklyPlanFromRow(row: WeeklyPlanRow): WeeklyPlan & { createdAt: string } {
  const tasks =
    typeof row.tasks === "string"
      ? JSON.parse(row.tasks) as WeeklyPlan["tasks"]
      : row.tasks;

  return {
    weekStart: row.week_start instanceof Date ? row.week_start.toISOString().slice(0, 10) : String(row.week_start),
    weeklyGoal: row.weekly_goal,
    targetMinutes: row.target_minutes,
    tasks,
    generatedAt: toIso(row.generated_at),
    createdAt: toIso(row.created_at),
  };
}

function numberCount(value: string | number | undefined) {
  return Number(value ?? 0);
}

function scoreSnapshotFromRow(row: ScoreSnapshotRow): ScoreSnapshot {
  const breakdown =
    typeof row.breakdown === "string"
      ? JSON.parse(row.breakdown) as ScoreBreakdown[]
      : row.breakdown;

  return {
    overall: Number(row.overall),
    generatedAt: toIso(row.created_at),
    breakdown,
    rubricVersion: row.rubric_version,
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeOperationalText(value: string): string {
  return value
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s"',;]+/gi, "$1=[REDACTED_SECRET]")
    .replace(/(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function vectorLiteral(values: number[]) {
  if (values.length !== MEMORY_EMBEDDING_DIMENSIONS) {
    throw new ConfigurationError(
      `Embedding vector must contain exactly ${MEMORY_EMBEDDING_DIMENSIONS} dimensions before it can be stored in memory_embeddings.`,
    );
  }

  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error("Embedding vector contains a non-finite value.");
    }
  }

  return `[${values.join(",")}]`;
}
