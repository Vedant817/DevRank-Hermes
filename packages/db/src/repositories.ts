import type { DailyPlan, EvidenceItem, EvidenceSource, ScoreBreakdown, ScoreSnapshot } from "@repo/shared";
import type { SqlClient } from "./client.js";

export interface PersistableGithubRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string | null;
  language: string | null;
  pushedAt: string | null;
  updatedAt: string | null;
}

export interface PersistableGithubPullRequest {
  id: number;
  repoFullName: string;
  number: number;
  title: string;
  state: string;
  htmlUrl: string | null;
  mergedAt: string | null;
  updatedAt: string | null;
}

export interface PersistableGithubBackfill {
  repos: PersistableGithubRepo[];
  pullRequests: PersistableGithubPullRequest[];
}

export interface PersistableLinearProject {
  id: string;
  name: string;
  state: string | null;
  progress: number | null;
  url: string | null;
  teamName: string | null;
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
}

export interface PersistableLinearBackfill {
  projects: PersistableLinearProject[];
  issues: PersistableLinearIssue[];
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
};

type DashboardSourceRow = {
  source: string;
  count: string | number;
};

type DashboardCountsRow = {
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

type IngestionRunRow = {
  source: string;
  status: string;
  summary: string | null;
  error: string | null;
  finished_at: Date | string | null;
};

export interface DashboardSummary {
  counts: {
    evidenceItems: number;
    githubPullRequests: number;
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
    insert into score_snapshots (overall, breakdown, created_at)
    values (${snapshot.overall}, ${breakdownJson}::jsonb, ${snapshot.generatedAt})
  `;
}

export async function getLatestScoreSnapshot(
  sql: SqlClient,
): Promise<ScoreSnapshot | undefined> {
  const rows = await sql<ScoreSnapshotRow[]>`
    select overall, breakdown, created_at
    from score_snapshots
    order by created_at desc
    limit 1
  `;

  const row = rows[0];

  if (!row) {
    return undefined;
  }

  const breakdown =
    typeof row.breakdown === "string"
      ? JSON.parse(row.breakdown) as ScoreBreakdown[]
      : row.breakdown;

  return {
    overall: Number(row.overall),
    generatedAt: toIso(row.created_at),
    breakdown,
  };
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

export async function insertDailyPlan(
  sql: SqlClient,
  plan: DailyPlan,
): Promise<void> {
  const tasksJson = JSON.stringify(plan.tasks);

  await sql`
    insert into daily_plans (plan_date, tasks, target_minutes)
    values (${plan.date}, ${tasksJson}::jsonb, ${plan.targetMinutes})
    on conflict (plan_date) do update set
      tasks = excluded.tasks,
      target_minutes = excluded.target_minutes
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

export async function upsertGithubBackfill(
  sql: SqlClient,
  input: PersistableGithubBackfill,
): Promise<{
  pullRequests: number;
  repos: number;
}> {
  const repoIdsByFullName = new Map<string, number>();
  let repos = 0;
  let pullRequests = 0;

  for (const repo of input.repos) {
    repoIdsByFullName.set(repo.fullName, repo.id);

    await sql`
      insert into github_repos (
        id,
        owner,
        name,
        full_name,
        private,
        default_branch,
        html_url,
        language,
        pushed_at,
        updated_at,
        synced_at
      )
      values (
        ${repo.id},
        ${repo.owner},
        ${repo.name},
        ${repo.fullName},
        ${repo.private},
        ${repo.defaultBranch},
        ${repo.htmlUrl},
        ${repo.language},
        ${repo.pushedAt},
        ${repo.updatedAt},
        now()
      )
      on conflict (id) do update set
        owner = excluded.owner,
        name = excluded.name,
        full_name = excluded.full_name,
        private = excluded.private,
        default_branch = excluded.default_branch,
        html_url = excluded.html_url,
        language = excluded.language,
        pushed_at = excluded.pushed_at,
        updated_at = excluded.updated_at,
        synced_at = now()
    `;
    repos += 1;
  }

  for (const pullRequest of input.pullRequests) {
    const repoId = repoIdsByFullName.get(pullRequest.repoFullName);

    if (repoId === undefined) {
      continue;
    }

    await sql`
      insert into github_pull_requests (
        id,
        repo_id,
        number,
        title,
        state,
        html_url,
        merged_at,
        updated_at,
        synced_at
      )
      values (
        ${pullRequest.id},
        ${repoId},
        ${pullRequest.number},
        ${pullRequest.title},
        ${pullRequest.state},
        ${pullRequest.htmlUrl},
        ${pullRequest.mergedAt},
        ${pullRequest.updatedAt},
        now()
      )
      on conflict (id) do update set
        repo_id = excluded.repo_id,
        number = excluded.number,
        title = excluded.title,
        state = excluded.state,
        html_url = excluded.html_url,
        merged_at = excluded.merged_at,
        updated_at = excluded.updated_at,
        synced_at = now()
    `;
    pullRequests += 1;
  }

  return {
    pullRequests,
    repos,
  };
}

export async function upsertLinearBackfill(
  sql: SqlClient,
  input: PersistableLinearBackfill,
): Promise<{
  issues: number;
  projects: number;
}> {
  const projectIds = new Set(input.projects.map((project) => project.id));
  let projects = 0;
  let issues = 0;

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
        ${null},
        ${project.name},
        ${project.state},
        ${project.progress},
        ${project.url},
        now()
      )
      on conflict (id) do update set
        name = excluded.name,
        state = excluded.state,
        progress = excluded.progress,
        url = excluded.url,
        synced_at = now()
    `;
    projects += 1;
  }

  for (const issue of input.issues) {
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
        synced_at
      )
      values (
        ${issue.id},
        ${issue.projectId && projectIds.has(issue.projectId) ? issue.projectId : null},
        ${null},
        ${issue.identifier},
        ${issue.title},
        ${issue.state},
        ${issue.priority},
        ${issue.assignee},
        ${issue.url},
        now()
      )
      on conflict (id) do update set
        project_id = excluded.project_id,
        identifier = excluded.identifier,
        title = excluded.title,
        state = excluded.state,
        priority = excluded.priority,
        assignee = excluded.assignee,
        url = excluded.url,
        synced_at = now()
    `;
    issues += 1;
  }

  return {
    issues,
    projects,
  };
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

function numberCount(value: string | number | undefined) {
  return Number(value ?? 0);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
