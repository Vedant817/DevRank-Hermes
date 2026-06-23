import { createHash } from "node:crypto";
import type { ScoreBreakdown } from "@repo/shared";
import type { SqlClient } from "./client.js";

const RESUME_READY_MIN_DAYS = 28;
const MAX_DRAFTS_PER_TYPE = 6;

export type ContentDraftType =
  | "resume_bullet"
  | "linkedin_post"
  | "x_post"
  | "portfolio_description"
  | "interview_talking_point"
  | "weekly_progress_summary";

export interface ContentDraftEvidence {
  id: string;
  source: string;
  title: string;
  url?: string;
}

export interface CareerContentDraft {
  body: string;
  draftKey: string;
  evidence: ContentDraftEvidence[];
  generatedAt: string;
  title: string;
  type: ContentDraftType;
}

export interface CareerContentDashboard {
  coverage: {
    evidenceCount: number;
    evidenceWindowDays: number;
    oldestEvidenceAt?: string;
    newestEvidenceAt?: string;
    resumeReady: boolean;
  };
  drafts: CareerContentDraft[];
  draftsByType: Record<ContentDraftType, CareerContentDraft[]>;
  generatedAt: string;
  latestStoredDrafts: CareerContentDraft[];
  totals: {
    completedTasks: number;
    drafts: number;
    evidenceItems: number;
    pullRequests: number;
    repositories: number;
    storedDrafts: number;
  };
}

export interface CareerContentEvidenceRow {
  createdAt: string;
  id: string;
  source: string;
  summary: string;
  title: string;
  url: string | null;
}

export interface CareerContentRepoRow {
  commits: number;
  fullName: string;
  hasArchitectureDiagram: boolean | null;
  hasDeploymentConfig: boolean | null;
  hasReadme: boolean | null;
  hasTests: boolean | null;
  htmlUrl: string | null;
  language: string | null;
  pullRequests: number;
  techStack: string[];
  updatedAt: string | null;
}

export interface CareerContentPullRequestRow {
  filesChanged: number;
  htmlUrl: string | null;
  mergedAt: string | null;
  number: number;
  repoFullName: string;
  reviews: number;
  testFiles: number;
  title: string;
  totalChanges: number;
  updatedAt: string | null;
}

export interface CareerContentTaskRow {
  completedAt: string | null;
  minutes: number;
  planDate: string;
  title: string;
}

export interface CareerContentScoreRow {
  breakdown: ScoreBreakdown[];
  generatedAt: string;
  overall: number;
}

type ContentDraftRow = {
  body: string;
  draft_key: string;
  draft_type: ContentDraftType;
  evidence: ContentDraftEvidence[] | string;
  generated_at: Date | string;
  title: string;
};

type MemorySqlRow = {
  created_at: Date | string;
  id: string;
  metadata: Record<string, unknown> | null;
  source: string;
  source_id: string | null;
  summary: string;
  title: string;
};

type RepoSqlRow = {
  commits: string | number;
  full_name: string;
  has_architecture_diagram: boolean | null;
  has_deployment_config: boolean | null;
  has_readme: boolean | null;
  has_tests: boolean | null;
  html_url: string | null;
  language: string | null;
  pull_requests: string | number;
  tech_stack: string[] | null;
  updated_at: Date | string | null;
};

type PullRequestSqlRow = {
  files_changed: string | number;
  html_url: string | null;
  merged_at: Date | string | null;
  number: number;
  repo_full_name: string;
  reviews: string | number;
  test_files: string | number;
  title: string;
  total_changes: string | number;
  updated_at: Date | string | null;
};

type TaskSqlRow = {
  completed_at: Date | string | null;
  minutes: number;
  plan_date: Date | string;
  title: string;
};

type ScoreSqlRow = {
  breakdown: ScoreBreakdown[] | string;
  created_at: Date | string;
  overall: string | number;
};

export async function getCareerContentDashboard(
  sql: SqlClient,
  options: { generatedAt?: string } = {},
): Promise<CareerContentDashboard> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const [evidenceRows, repoRows, pullRequestRows, taskRows, scoreRows, draftRows] = await Promise.all([
    sql<MemorySqlRow[]>`
      select id::text, source, source_id, title, summary, metadata, created_at
      from memory_items
      order by created_at desc
      limit 500
    `,
    sql<RepoSqlRow[]>`
      select
        repo.full_name,
        repo.html_url,
        repo.language,
        coalesce(repo.updated_at, repo.pushed_at, repo.synced_at) as updated_at,
        profile.has_readme,
        profile.has_tests,
        profile.has_deployment_config,
        profile.has_architecture_diagram,
        profile.tech_stack,
        count(distinct commit.sha) as commits,
        count(distinct pr.id) as pull_requests
      from github_repos repo
      left join github_repo_profiles profile on profile.repo_id = repo.id
      left join github_commits commit on commit.repo_id = repo.id
      left join github_pull_requests pr on pr.repo_id = repo.id
      group by
        repo.id,
        repo.full_name,
        repo.html_url,
        repo.language,
        repo.updated_at,
        repo.pushed_at,
        repo.synced_at,
        profile.has_readme,
        profile.has_tests,
        profile.has_deployment_config,
        profile.has_architecture_diagram,
        profile.tech_stack
      order by coalesce(repo.updated_at, repo.pushed_at, repo.synced_at) desc
      limit 50
    `,
    sql<PullRequestSqlRow[]>`
      with file_stats as (
        select
          pull_request_id,
          count(*) as files_changed,
          coalesce(sum(changes), 0) as total_changes,
          count(*) filter (
            where filename ~* '(^|/)(__tests__|tests?|spec)(/|$)|\\.(test|spec)\\.[cm]?[jt]sx?$|\\.(test|spec)\\.py$'
          ) as test_files
        from github_pr_files
        group by pull_request_id
      ),
      review_stats as (
        select pull_request_id, count(*) as reviews
        from github_pr_reviews
        group by pull_request_id
      )
      select
        repo.full_name as repo_full_name,
        pr.number,
        pr.title,
        pr.html_url,
        pr.merged_at,
        pr.updated_at,
        coalesce(file_stats.files_changed, 0) as files_changed,
        coalesce(file_stats.total_changes, 0) as total_changes,
        coalesce(file_stats.test_files, 0) as test_files,
        coalesce(review_stats.reviews, 0) as reviews
      from github_pull_requests pr
      join github_repos repo on repo.id = pr.repo_id
      left join file_stats on file_stats.pull_request_id = pr.id
      left join review_stats on review_stats.pull_request_id = pr.id
      order by coalesce(pr.merged_at, pr.updated_at, pr.synced_at) desc
      limit 50
    `,
    sql<TaskSqlRow[]>`
      select plan_date, title, minutes, completed_at
      from daily_tasks
      where status = 'completed'
      order by coalesce(completed_at, plan_date::timestamptz) desc
      limit 100
    `,
    sql<ScoreSqlRow[]>`
      select overall, breakdown, created_at
      from score_snapshots
      order by created_at desc
      limit 1
    `,
    sql<ContentDraftRow[]>`
      select draft_key, draft_type, title, body, evidence, generated_at
      from content_drafts
      order by generated_at desc, created_at desc
      limit 60
    `,
  ]);

  return buildCareerContentDashboard({
    generatedAt,
    evidenceRows: evidenceRows.map((row) => ({
      createdAt: toIso(row.created_at),
      id: row.source_id ?? row.id,
      source: row.source,
      summary: row.summary,
      title: row.title,
      url: metadataUrl(row.metadata),
    })),
    repoRows: repoRows.map((row) => ({
      commits: Number(row.commits),
      fullName: row.full_name,
      hasArchitectureDiagram: row.has_architecture_diagram,
      hasDeploymentConfig: row.has_deployment_config,
      hasReadme: row.has_readme,
      hasTests: row.has_tests,
      htmlUrl: row.html_url,
      language: row.language,
      pullRequests: Number(row.pull_requests),
      techStack: row.tech_stack ?? [],
      updatedAt: row.updated_at ? toIso(row.updated_at) : null,
    })),
    pullRequestRows: pullRequestRows.map((row) => ({
      filesChanged: Number(row.files_changed),
      htmlUrl: row.html_url,
      mergedAt: row.merged_at ? toIso(row.merged_at) : null,
      number: row.number,
      repoFullName: row.repo_full_name,
      reviews: Number(row.reviews),
      testFiles: Number(row.test_files),
      title: row.title,
      totalChanges: Number(row.total_changes),
      updatedAt: row.updated_at ? toIso(row.updated_at) : null,
    })),
    taskRows: taskRows.map((row) => ({
      completedAt: row.completed_at ? toIso(row.completed_at) : null,
      minutes: row.minutes,
      planDate: row.plan_date instanceof Date ? row.plan_date.toISOString().slice(0, 10) : String(row.plan_date),
      title: row.title,
    })),
    scoreRow: scoreRows[0] ? scoreRowFromSql(scoreRows[0]) : undefined,
    storedDraftRows: draftRows.map(draftFromRow),
  });
}

export async function generateAndStoreCareerContentDrafts(
  sql: SqlClient,
  options: { generatedAt?: string } = {},
): Promise<CareerContentDashboard> {
  const dashboard = await getCareerContentDashboard(sql, options);

  for (const draft of dashboard.drafts) {
    await upsertContentDraft(sql, draft);
  }

  if (dashboard.drafts.length === 0) {
    return dashboard;
  }

  return {
    ...dashboard,
    latestStoredDrafts: dashboard.drafts,
    totals: {
      ...dashboard.totals,
      storedDrafts: dashboard.drafts.length,
    },
  };
}

export function buildCareerContentDashboard(input: {
  evidenceRows: CareerContentEvidenceRow[];
  generatedAt: string;
  pullRequestRows: CareerContentPullRequestRow[];
  repoRows: CareerContentRepoRow[];
  scoreRow?: CareerContentScoreRow;
  storedDraftRows?: CareerContentDraft[];
  taskRows: CareerContentTaskRow[];
}): CareerContentDashboard {
  const evidenceRows = input.evidenceRows
    .map(safeEvidenceRow)
    .filter((row) => row.title.length > 0 || row.summary.length > 0);
  const repos = input.repoRows.map(safeRepoRow).filter((repo) => repo.fullName.length > 0);
  const pullRequests = input.pullRequestRows.map(safePullRequestRow).filter((pr) => pr.title.length > 0);
  const completedTasks = input.taskRows.map(safeTaskRow).filter((task) => task.title.length > 0);
  const evidenceDates = [
    ...evidenceRows.map((row) => row.createdAt),
    ...repos.flatMap((repo) => repo.updatedAt ? [repo.updatedAt] : []),
    ...pullRequests.flatMap((pr) => (pr.mergedAt ?? pr.updatedAt) ? [pr.mergedAt ?? pr.updatedAt ?? ""] : []),
    ...completedTasks.flatMap((task) => task.completedAt ? [task.completedAt] : []),
  ].filter(Boolean).sort();
  const oldestEvidenceAt = evidenceDates[0];
  const newestEvidenceAt = evidenceDates[evidenceDates.length - 1];
  const evidenceWindowDays = oldestEvidenceAt && newestEvidenceAt
    ? daysBetween(oldestEvidenceAt, newestEvidenceAt) + 1
    : 0;
  const resumeReady = evidenceWindowDays >= RESUME_READY_MIN_DAYS;
  const source = {
    evidenceRows,
    repos,
    pullRequests,
    completedTasks,
    score: input.scoreRow,
    resumeReady,
    generatedAt: input.generatedAt,
  };
  const drafts = [
    ...(resumeReady ? resumeDrafts(source) : []),
    ...linkedinDrafts(source),
    ...xPostDrafts(source),
    ...portfolioDrafts(source),
    ...interviewDrafts(source),
    ...weeklySummaryDrafts(source),
  ];

  return {
    coverage: {
      evidenceCount: evidenceRows.length + repos.length + pullRequests.length + completedTasks.length,
      evidenceWindowDays,
      ...(oldestEvidenceAt ? { oldestEvidenceAt } : {}),
      ...(newestEvidenceAt ? { newestEvidenceAt } : {}),
      resumeReady,
    },
    drafts,
    draftsByType: groupDraftsByType(drafts),
    generatedAt: input.generatedAt,
    latestStoredDrafts: input.storedDraftRows ?? [],
    totals: {
      completedTasks: completedTasks.length,
      drafts: drafts.length,
      evidenceItems: evidenceRows.length,
      pullRequests: pullRequests.length,
      repositories: repos.length,
      storedDrafts: input.storedDraftRows?.length ?? 0,
    },
  };
}

async function upsertContentDraft(sql: SqlClient, draft: CareerContentDraft): Promise<void> {
  const evidenceJson = JSON.stringify(draft.evidence);
  const metadataJson = JSON.stringify({
    evidenceCount: draft.evidence.length,
    generatedBy: "deterministic-career-content-generator",
  });

  await sql`
    insert into content_drafts (
      draft_key,
      draft_type,
      title,
      body,
      evidence,
      metadata,
      generated_at
    )
    values (
      ${draft.draftKey},
      ${draft.type},
      ${draft.title},
      ${draft.body},
      ${evidenceJson}::jsonb,
      ${metadataJson}::jsonb,
      ${draft.generatedAt}
    )
    on conflict (draft_key) do update set
      title = excluded.title,
      body = excluded.body,
      evidence = excluded.evidence,
      metadata = excluded.metadata,
      generated_at = excluded.generated_at,
      updated_at = now()
  `;
}

function resumeDrafts(source: DraftSource): CareerContentDraft[] {
  return [
    ...source.repos.slice(0, 2).map((repo) => draft(
      "resume_bullet",
      `Resume bullet for ${repo.fullName}`,
      `Built ${repoName(repo.fullName)}, a ${repoStack(repo)} project with ${repo.commits} commit(s), ${repo.pullRequests} pull request(s), ${repoQuality(repo)}, and evidence-backed portfolio documentation.`,
      source.generatedAt,
      [repoEvidence(repo)],
    )),
    ...source.pullRequests.slice(0, 2).map((pr) => draft(
      "resume_bullet",
      `Resume bullet for ${pr.repoFullName}#${pr.number}`,
      `Delivered ${pr.title} in ${pr.repoFullName}#${pr.number}, changing ${pr.filesChanged} file(s) across ${pr.totalChanges} line(s) with ${pr.testFiles} test file signal(s) and ${pr.reviews} review(s).`,
      source.generatedAt,
      [pullRequestEvidence(pr)],
    )),
  ].slice(0, MAX_DRAFTS_PER_TYPE);
}

function linkedinDrafts(source: DraftSource): CareerContentDraft[] {
  const drafts: CareerContentDraft[] = [];
  const pr = source.pullRequests[0];
  const repo = source.repos[0];

  if (pr) {
    drafts.push(draft(
      "linkedin_post",
      `LinkedIn idea from ${pr.repoFullName}#${pr.number}`,
      `Post about shipping ${pr.title}: explain the problem, the ${pr.filesChanged} file(s) touched, how tests/reviews de-risked it, and what changed in the system.`,
      source.generatedAt,
      [pullRequestEvidence(pr)],
    ));
  }

  if (repo) {
    drafts.push(draft(
      "linkedin_post",
      `LinkedIn idea from ${repo.fullName}`,
      `Post about turning ${repoName(repo.fullName)} into portfolio proof: describe the architecture, ${repoStack(repo)} stack, quality gaps closed, and how the repo proves SDE readiness.`,
      source.generatedAt,
      [repoEvidence(repo)],
    ));
  }

  return drafts.slice(0, MAX_DRAFTS_PER_TYPE);
}

function xPostDrafts(source: DraftSource): CareerContentDraft[] {
  return [
    ...source.pullRequests.slice(0, 3).map((pr) => draft(
      "x_post",
      `X post from ${pr.repoFullName}#${pr.number}`,
      `Shipped ${pr.title} in ${pr.repoFullName}#${pr.number}: ${pr.filesChanged} files, ${pr.totalChanges} changed lines, ${pr.testFiles} test file signal(s). Small proof beats vague progress.`,
      source.generatedAt,
      [pullRequestEvidence(pr)],
    )),
    ...source.completedTasks.slice(0, 2).map((task) => draft(
      "x_post",
      `X post from ${task.planDate}`,
      `Completed today's DevRank task: ${task.title} (${task.minutes} min). Logged it as evidence instead of relying on memory.`,
      source.generatedAt,
      [taskEvidence(task)],
    )),
  ].slice(0, MAX_DRAFTS_PER_TYPE);
}

function portfolioDrafts(source: DraftSource): CareerContentDraft[] {
  return source.repos.slice(0, MAX_DRAFTS_PER_TYPE).map((repo) => draft(
    "portfolio_description",
    `Portfolio description for ${repo.fullName}`,
    `${repoName(repo.fullName)} is a ${repoStack(repo)} project with ${repo.commits} commit(s), ${repo.pullRequests} pull request(s), ${repoQuality(repo)}. Position it around the real engineering problem, architecture decisions, tests, deployment setup, and the measurable evidence imported into DevRank OS.`,
    source.generatedAt,
    [repoEvidence(repo)],
  ));
}

function interviewDrafts(source: DraftSource): CareerContentDraft[] {
  const drafts: CareerContentDraft[] = [];
  const weakestLane = source.score?.breakdown.slice().sort((a, b) => a.score - b.score)[0];

  if (weakestLane && source.score) {
    drafts.push(draft(
      "interview_talking_point",
      `Talking point for ${weakestLane.label}`,
      `Explain how DevRank OS exposed ${weakestLane.label} as a growth lane at ${weakestLane.score}%, then describe the concrete project or daily-plan evidence used to improve it.`,
      source.generatedAt,
      [scoreEvidence(source.score)],
    ));
  }

  for (const pr of source.pullRequests.slice(0, 3)) {
    drafts.push(draft(
      "interview_talking_point",
      `Talking point for ${pr.repoFullName}#${pr.number}`,
      `For ${pr.title}, discuss scope, tradeoffs, changed files, test signal, review feedback, and how the implementation would be monitored after deployment.`,
      source.generatedAt,
      [pullRequestEvidence(pr)],
    ));
  }

  return drafts.slice(0, MAX_DRAFTS_PER_TYPE);
}

function weeklySummaryDrafts(source: DraftSource): CareerContentDraft[] {
  const recentTasks = source.completedTasks.filter((task) => daysBetween(task.planDate, source.generatedAt) <= 7);
  const recentPrs = source.pullRequests.filter((pr) => {
    const date = pr.mergedAt ?? pr.updatedAt;

    return date ? daysBetween(date, source.generatedAt) <= 7 : false;
  });

  if (recentTasks.length === 0 && recentPrs.length === 0) {
    return [];
  }

  const evidence = [
    ...recentTasks.slice(0, 3).map(taskEvidence),
    ...recentPrs.slice(0, 3).map(pullRequestEvidence),
  ];

  return [draft(
    "weekly_progress_summary",
    "Weekly progress summary",
    `This week: completed ${recentTasks.length} tracked learning task(s), shipped or updated ${recentPrs.length} pull request(s), and kept public-proof material tied to real evidence. Next step: convert the strongest PR/repo signal into one resume or portfolio update.`,
    source.generatedAt,
    evidence,
  )];
}

type DraftSource = {
  completedTasks: CareerContentTaskRow[];
  evidenceRows: CareerContentEvidenceRow[];
  generatedAt: string;
  pullRequests: CareerContentPullRequestRow[];
  repos: CareerContentRepoRow[];
  resumeReady: boolean;
  score?: CareerContentScoreRow;
};

function draft(
  type: ContentDraftType,
  title: string,
  body: string,
  generatedAt: string,
  evidence: ContentDraftEvidence[],
): CareerContentDraft {
  const sanitizedTitle = sanitizeText(title);
  const sanitizedBody = sanitizeText(body);
  const sanitizedEvidence = evidence
    .map((item) => ({
      id: sanitizeText(item.id).slice(0, 160),
      source: sanitizeText(item.source).slice(0, 80),
      title: sanitizeText(item.title).slice(0, 240),
      ...(item.url ? { url: item.url } : {}),
    }))
    .filter((item) => item.id.length > 0 && item.title.length > 0);
  const draftKey = createHash("sha256")
    .update(`${type}:${sanitizedTitle}:${sanitizedEvidence.map((item) => item.id).join("|")}`)
    .digest("hex")
    .slice(0, 20);

  return {
    body: sanitizedBody,
    draftKey,
    evidence: sanitizedEvidence,
    generatedAt,
    title: sanitizedTitle,
    type,
  };
}

function groupDraftsByType(drafts: CareerContentDraft[]): Record<ContentDraftType, CareerContentDraft[]> {
  const grouped: Record<ContentDraftType, CareerContentDraft[]> = {
    resume_bullet: [],
    linkedin_post: [],
    x_post: [],
    portfolio_description: [],
    interview_talking_point: [],
    weekly_progress_summary: [],
  };

  for (const draftItem of drafts) {
    grouped[draftItem.type].push(draftItem);
  }

  return grouped;
}

function draftFromRow(row: ContentDraftRow): CareerContentDraft {
  const evidence =
    typeof row.evidence === "string"
      ? JSON.parse(row.evidence) as ContentDraftEvidence[]
      : row.evidence;

  return {
    body: row.body,
    draftKey: row.draft_key,
    evidence,
    generatedAt: toIso(row.generated_at),
    title: row.title,
    type: row.draft_type,
  };
}

function scoreRowFromSql(row: ScoreSqlRow): CareerContentScoreRow {
  const breakdown =
    typeof row.breakdown === "string"
      ? JSON.parse(row.breakdown) as ScoreBreakdown[]
      : row.breakdown;

  return {
    breakdown,
    generatedAt: toIso(row.created_at),
    overall: Number(row.overall),
  };
}

function safeEvidenceRow(row: CareerContentEvidenceRow): CareerContentEvidenceRow {
  return {
    ...row,
    id: sanitizeText(row.id),
    source: sanitizeText(row.source),
    summary: sanitizeText(row.summary),
    title: sanitizeText(row.title),
  };
}

function safeRepoRow(row: CareerContentRepoRow): CareerContentRepoRow {
  return {
    ...row,
    fullName: sanitizeText(row.fullName),
    language: row.language ? sanitizeText(row.language) : null,
    techStack: row.techStack.map(sanitizeText).filter(Boolean),
  };
}

function safePullRequestRow(row: CareerContentPullRequestRow): CareerContentPullRequestRow {
  return {
    ...row,
    repoFullName: sanitizeText(row.repoFullName),
    title: sanitizeText(row.title),
  };
}

function safeTaskRow(row: CareerContentTaskRow): CareerContentTaskRow {
  return {
    ...row,
    title: sanitizeText(row.title),
  };
}

function sanitizeText(value: string): string {
  return value
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s"',;]+/gi, "$1=[REDACTED_SECRET]")
    .replace(/(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\s+/g, " ")
    .trim();
}

function repoEvidence(repo: CareerContentRepoRow): ContentDraftEvidence {
  return {
    id: `repo:${repo.fullName}`,
    source: "github",
    title: repo.fullName,
    ...(repo.htmlUrl ? { url: repo.htmlUrl } : {}),
  };
}

function pullRequestEvidence(pr: CareerContentPullRequestRow): ContentDraftEvidence {
  return {
    id: `pr:${pr.repoFullName}#${pr.number}`,
    source: "github",
    title: `${pr.repoFullName}#${pr.number} ${pr.title}`,
    ...(pr.htmlUrl ? { url: pr.htmlUrl } : {}),
  };
}

function taskEvidence(task: CareerContentTaskRow): ContentDraftEvidence {
  return {
    id: `daily-task:${task.planDate}:${task.title}`,
    source: "daily_task",
    title: task.title,
  };
}

function scoreEvidence(score: CareerContentScoreRow): ContentDraftEvidence {
  return {
    id: `score:${score.generatedAt}`,
    source: "score_snapshot",
    title: `SDE readiness ${score.overall}%`,
  };
}

function repoName(fullName: string): string {
  return fullName.split("/").pop() ?? fullName;
}

function repoStack(repo: CareerContentRepoRow): string {
  const stack = repo.techStack.length > 0
    ? repo.techStack
    : repo.language
      ? [repo.language]
      : ["software"];

  return stack.slice(0, 3).join(", ");
}

function repoQuality(repo: CareerContentRepoRow): string {
  const signals = [
    repo.hasReadme ? "README" : undefined,
    repo.hasTests ? "tests" : undefined,
    repo.hasDeploymentConfig ? "deployment config" : undefined,
    repo.hasArchitectureDiagram ? "architecture diagram" : undefined,
  ].filter(Boolean);

  return signals.length > 0 ? signals.join(", ") : "tracked improvement gaps";
}

function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((endMs - startMs) / 86_400_000));
}

function metadataUrl(metadata: Record<string, unknown> | null): string | null {
  const value = metadata?.url;

  return typeof value === "string" && /^https?:\/\//.test(value) ? value : null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
