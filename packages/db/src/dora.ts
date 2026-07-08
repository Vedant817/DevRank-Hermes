import type { SqlClient } from "./client.js";
import type { GithubReleaseRecord } from "./repositories.js";

export interface DoraMetricsSnapshot {
  leadTimeForChanges: { value: number; unit: "hours"; confidence: "proxy" };
  changeFailureRate: { value: number; unit: "ratio"; confidence: "proxy" };
  deploymentFrequency: {
    value: number;
    unit: "per_week";
    confidence: "measured" | "insufficient_data";
  };
  mttr: { status: "not_computed"; reason: string };
  windowStart: string;
  windowEnd: string;
}

export interface DoraComputationInput {
  windowStart: string;
  windowEnd: string;
  releases: GithubReleaseRecord[];
  commits: Array<{ repoId: number; committedAt: string }>;
  pullRequests: Array<{ repoId: number; mergedAt: string | null }>;
  prChecks: Array<{ conclusion: string | null }>;
  workflowRuns: Array<{ conclusion: string | null }>;
}

const FAILURE_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "stale"]);

export function computeDoraMetrics(input: DoraComputationInput): DoraMetricsSnapshot {
  const windowStart = new Date(input.windowStart);
  const windowEnd = new Date(input.windowEnd);
  const windowMs = Math.max(1, windowEnd.getTime() - windowStart.getTime());
  const weeks = Math.max(1, windowMs / (7 * 24 * 60 * 60 * 1000));

  const leadTimeHours = computeLeadTimeForChanges(input);
  const changeFailureRate = computeChangeFailureRate(input);
  const deploymentFrequency = computeDeploymentFrequency(input, weeks);

  return {
    leadTimeForChanges: { value: leadTimeHours, unit: "hours", confidence: "proxy" },
    changeFailureRate: { value: changeFailureRate, unit: "ratio", confidence: "proxy" },
    deploymentFrequency,
    mttr: {
      status: "not_computed",
      reason:
        "MTTR requires incident/label data that DevRank OS does not capture yet. " +
        "Reporting a proxy here would misrepresent an unmeasured metric, so it is intentionally omitted.",
    },
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  };
}

function computeLeadTimeForChanges(input: DoraComputationInput): number {
  const commitsByRepo = new Map<number, number[]>();

  for (const commit of input.commits) {
    const timestamp = timestampOrUndefined(commit.committedAt);

    if (timestamp === undefined) {
      continue;
    }

    const list = commitsByRepo.get(commit.repoId) ?? [];
    list.push(timestamp);
    commitsByRepo.set(commit.repoId, list);
  }

  for (const list of commitsByRepo.values()) {
    list.sort((first, second) => first - second);
  }

  let totalHours = 0;
  let counted = 0;

  for (const pullRequest of input.pullRequests) {
    const mergedTimestamp = timestampOrUndefined(pullRequest.mergedAt);

    if (mergedTimestamp === undefined) {
      continue;
    }

    const repoCommits = commitsByRepo.get(pullRequest.repoId);

    if (!repoCommits || repoCommits.length === 0) {
      continue;
    }

    let nearestCommit = repoCommits[0] as number;

    for (const commitTimestamp of repoCommits) {
      if (commitTimestamp <= mergedTimestamp) {
        nearestCommit = commitTimestamp;
      } else {
        break;
      }
    }

    const deltaHours = (mergedTimestamp - nearestCommit) / (60 * 60 * 1000);

    if (deltaHours >= 0) {
      totalHours += deltaHours;
      counted += 1;
    }
  }

  return counted === 0 ? 0 : Math.round((totalHours / counted) * 100) / 100;
}

function computeChangeFailureRate(input: DoraComputationInput): number {
  let failures = 0;
  let completed = 0;

  for (const check of [...input.prChecks, ...input.workflowRuns]) {
    const conclusion = check.conclusion;

    if (conclusion === "success") {
      completed += 1;
    } else if (conclusion !== null && FAILURE_CONCLUSIONS.has(conclusion)) {
      failures += 1;
      completed += 1;
    }
  }

  if (completed === 0) {
    return 0;
  }

  return Math.round((failures / completed) * 1000) / 1000;
}

function computeDeploymentFrequency(
  input: DoraComputationInput,
  weeks: number,
): DoraMetricsSnapshot["deploymentFrequency"] {
  const counted = input.releases.filter((release) => {
    const timestamp = timestampOrUndefined(release.publishedAt);

    if (timestamp === undefined) {
      return false;
    }

    return timestamp >= new Date(input.windowStart).getTime() &&
      timestamp <= new Date(input.windowEnd).getTime();
  });

  const perWeek = Math.round((counted.length / weeks) * 100) / 100;

  return {
    value: perWeek,
    unit: "per_week",
    confidence: counted.length > 0 ? "measured" : "insufficient_data",
  };
}

export async function buildDoraMetricsFromDb(
  sql: SqlClient,
  options: {
    windowStart: string;
    windowEnd: string;
    repoId?: number;
  },
): Promise<DoraMetricsSnapshot> {
  const [releases, commitRows, pullRequestRows, prCheckRows, workflowRunRows] = await Promise.all([
    listReleasesInWindow(sql, options),
    sql<{ repo_id: number; committed_at: Date | string }[]>`
      select repo_id, committed_at
      from github_commits
      where committed_at >= ${options.windowStart}
        and committed_at <= ${options.windowEnd}
        ${options.repoId ? sql`and repo_id = ${options.repoId}` : sql``}
    `,
    sql<{ repo_id: number; merged_at: Date | string | null }[]>`
      select repo_id, merged_at
      from github_pull_requests
      where merged_at >= ${options.windowStart}
        and merged_at <= ${options.windowEnd}
        ${options.repoId ? sql`and repo_id = ${options.repoId}` : sql``}
    `,
    sql<{ conclusion: string | null }[]>`
      select conclusion
      from github_pr_checks
      where 1 = 1
        ${options.repoId ? sql`and pull_request_id in (select id from github_pull_requests where repo_id = ${options.repoId})` : sql``}
    `,
    sql<{ conclusion: string | null }[]>`
      select conclusion
      from github_workflow_runs
      where 1 = 1
        ${options.repoId ? sql`and repo_id = ${options.repoId}` : sql``}
    `,
  ]);

  return computeDoraMetrics({
    windowStart: options.windowStart,
    windowEnd: options.windowEnd,
    releases,
    commits: commitRows.map((row) => ({
      repoId: Number(row.repo_id),
      committedAt: toIso(row.committed_at),
    })),
    pullRequests: pullRequestRows.map((row) => ({
      repoId: Number(row.repo_id),
      mergedAt: row.merged_at ? toIso(row.merged_at) : null,
    })),
    prChecks: prCheckRows.map((row) => ({ conclusion: row.conclusion })),
    workflowRuns: workflowRunRows.map((row) => ({ conclusion: row.conclusion })),
  });
}

async function listReleasesInWindow(
  sql: SqlClient,
  options: { windowStart: string; windowEnd: string; repoId?: number },
): Promise<GithubReleaseRecord[]> {
  const rows = options.repoId !== undefined
    ? await sql<GithubReleaseRow[]>`
      select id, repo_id, tag_name, name, published_at, html_url
      from github_releases
      where repo_id = ${options.repoId}
        and published_at >= ${options.windowStart}
        and published_at <= ${options.windowEnd}
      order by published_at desc nulls last
    `
    : await sql<GithubReleaseRow[]>`
      select id, repo_id, tag_name, name, published_at, html_url
      from github_releases
      where published_at >= ${options.windowStart}
        and published_at <= ${options.windowEnd}
      order by published_at desc nulls last
    `;

  return rows.map((row) => ({
    id: Number(row.id),
    repoId: Number(row.repo_id),
    tagName: row.tag_name ?? undefined,
    name: row.name ?? undefined,
    htmlUrl: row.html_url ?? undefined,
    ...(row.published_at ? { publishedAt: toIso(row.published_at) } : {}),
  }));
}

type GithubReleaseRow = {
  id: number;
  repo_id: number;
  tag_name: string | null;
  name: string | null;
  published_at: Date | string | null;
  html_url: string | null;
};

function timestampOrUndefined(value: string | null | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
