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

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
