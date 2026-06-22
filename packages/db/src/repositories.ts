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

type GithubRepoEvidenceRow = {
  id: string | number;
  full_name: string;
  language: string | null;
  html_url: string | null;
  pushed_at: Date | string | null;
  updated_at: Date | string | null;
};

type GithubPullRequestEvidenceRow = {
  id: string | number;
  repo_full_name: string;
  number: number;
  title: string;
  state: string;
  html_url: string | null;
  merged_at: Date | string | null;
  updated_at: Date | string | null;
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

export type ScoringEvidenceScope = "all" | "user" | "repo" | "pull_request";

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
  target: PullRequestTarget,
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

async function listGithubRepoEvidence(
  sql: SqlClient,
  repoFullName: string | undefined,
  limit: number,
): Promise<EvidenceItem[]> {
  const rows = repoFullName
    ? await sql<GithubRepoEvidenceRow[]>`
        select id, full_name, language, html_url, pushed_at, updated_at
        from github_repos
        where full_name = ${repoFullName}
        order by coalesce(updated_at, pushed_at, synced_at) desc
        limit ${limit}
      `
    : await sql<GithubRepoEvidenceRow[]>`
        select id, full_name, language, html_url, pushed_at, updated_at
        from github_repos
        order by coalesce(updated_at, pushed_at, synced_at) desc
        limit ${limit}
      `;

  return rows.map((row) => ({
    id: `github:repo:${row.id}`,
    source: "github",
    title: `GitHub repository: ${row.full_name}`,
    summary: [
      `Repository ${row.full_name} is tracked in GitHub backfill.`,
      row.language ? `Primary language: ${row.language}.` : "",
    ].filter(Boolean).join(" "),
    occurredAt: toIso(row.updated_at ?? row.pushed_at ?? new Date().toISOString()),
    ...(row.html_url ? { url: row.html_url } : {}),
    metadata: {
      repository: row.full_name,
      language: row.language,
      kind: "github_repo",
    },
  }));
}

type PullRequestTarget = {
  number: number;
  repoFullName?: string;
};

async function listGithubPullRequestEvidence(
  sql: SqlClient,
  target: Partial<PullRequestTarget>,
  limit: number,
): Promise<EvidenceItem[]> {
  const rows = target.repoFullName && target.number !== undefined
    ? await sql<GithubPullRequestEvidenceRow[]>`
        select
          pr.id,
          repo.full_name as repo_full_name,
          pr.number,
          pr.title,
          pr.state,
          pr.html_url,
          pr.merged_at,
          pr.updated_at
        from github_pull_requests pr
        join github_repos repo on repo.id = pr.repo_id
        where repo.full_name = ${target.repoFullName}
          and pr.number = ${target.number}
        order by coalesce(pr.updated_at, pr.synced_at) desc
        limit ${limit}
      `
    : target.repoFullName
      ? await sql<GithubPullRequestEvidenceRow[]>`
          select
            pr.id,
            repo.full_name as repo_full_name,
            pr.number,
            pr.title,
            pr.state,
            pr.html_url,
            pr.merged_at,
            pr.updated_at
          from github_pull_requests pr
          join github_repos repo on repo.id = pr.repo_id
          where repo.full_name = ${target.repoFullName}
          order by coalesce(pr.updated_at, pr.synced_at) desc
          limit ${limit}
        `
      : target.number !== undefined
        ? await sql<GithubPullRequestEvidenceRow[]>`
            select
              pr.id,
              repo.full_name as repo_full_name,
              pr.number,
              pr.title,
              pr.state,
              pr.html_url,
              pr.merged_at,
              pr.updated_at
            from github_pull_requests pr
            join github_repos repo on repo.id = pr.repo_id
            where pr.number = ${target.number}
            order by coalesce(pr.updated_at, pr.synced_at) desc
            limit ${limit}
          `
        : await sql<GithubPullRequestEvidenceRow[]>`
            select
              pr.id,
              repo.full_name as repo_full_name,
              pr.number,
              pr.title,
              pr.state,
              pr.html_url,
              pr.merged_at,
              pr.updated_at
            from github_pull_requests pr
            join github_repos repo on repo.id = pr.repo_id
            order by coalesce(pr.updated_at, pr.synced_at) desc
            limit ${limit}
          `;

  return rows.map((row) => ({
    id: `github:pull_request:${row.id}`,
    source: "github",
    title: `GitHub PR ${row.repo_full_name}#${row.number}: ${row.title}`,
    summary: [
      `Pull request ${row.repo_full_name}#${row.number} is ${row.state}.`,
      row.merged_at ? "It has been merged." : "",
    ].filter(Boolean).join(" "),
    occurredAt: toIso(row.updated_at ?? row.merged_at ?? new Date().toISOString()),
    ...(row.html_url ? { url: row.html_url } : {}),
    metadata: {
      repository: row.repo_full_name,
      pullRequestNumber: row.number,
      state: row.state,
      kind: "github_pull_request",
    },
  }));
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

function parsePullRequestTarget(targetId: string): PullRequestTarget {
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

function numberCount(value: string | number | undefined) {
  return Number(value ?? 0);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
