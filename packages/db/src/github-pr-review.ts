import type { SqlClient } from "./client.js";

export interface GithubPrReviewDashboard {
  totals: {
    failingCiPullRequests: number;
    filesChanged: number;
    highRiskPullRequests: number;
    passingCiPullRequests: number;
    pullRequests: number;
    reviews: number;
  };
  pullRequests: GithubPrReviewItem[];
}

export type GithubPrType = "bug" | "docs" | "feature" | "refactor" | "test";

export type GithubPrComplexity = "high" | "low" | "medium";

export interface GithubPrReviewItem {
  architectureImpact: "high" | "low" | "medium";
  ciChecks: number;
  ciHealth: "failing" | "inconclusive" | "passing" | "pending" | "unavailable";
  ciSummary: string;
  codeSmellScore: number;
  complexity: GithubPrComplexity;
  filesChanged: number;
  learningExtracted: string[];
  mergeStatus: "closed" | "merged" | "open";
  number: number;
  prQualityScore: number;
  prType: GithubPrType;
  repoFullName: string;
  resumeWorthyImpact: string;
  reviewComments: number;
  reviewState: "approved" | "changes-requested" | "reviewed" | "unreviewed";
  reviewTimeline: GithubPrReviewTimelineItem[];
  riskLevel: "high" | "low" | "medium";
  securityIssues: string[];
  summary: string;
  testQuality: "missing" | "partial" | "strong";
  title: string;
  topFiles: string[];
  totalChanges: number;
  url: string | null;
  updatedAt: string | null;
}

export interface GithubPrReviewTimelineItem {
  commentCount: number;
  htmlUrl: string | null;
  id: number;
  reviewerLogin: string | null;
  state: string;
  submittedAt: string | null;
}

export interface GithubPrReviewRow {
  approvalReviews: number;
  architectureFiles: number;
  backendFiles: number;
  changesRequestedReviews: number;
  checkCount: number;
  failedChecks: number;
  fileCount: number;
  files: string[];
  frontendFiles: number;
  htmlUrl: string | null;
  infraFiles: number;
  mergedAt: string | null;
  number: number;
  passedChecks: number;
  pendingChecks: number;
  repoFullName: string;
  reviewComments: number;
  reviewTimeline?: GithubPrReviewTimelineItem[];
  reviews: number;
  securityFiles: number;
  state: string;
  successfulChecks: number;
  testFiles: number;
  title: string;
  totalAdditions: number;
  totalChanges: number;
  totalDeletions: number;
  updatedAt: string | null;
}

type GithubPrReviewSqlRow = {
  approval_reviews: string | number;
  architecture_files: string | number;
  backend_files: string | number;
  changes_requested_reviews: string | number;
  check_count: string | number;
  failed_checks: string | number;
  file_count: string | number;
  files: string[] | null;
  frontend_files: string | number;
  html_url: string | null;
  infra_files: string | number;
  merged_at: Date | string | null;
  number: number;
  passed_checks: string | number;
  pending_checks: string | number;
  repo_full_name: string;
  review_comments: string | number;
  review_timeline: unknown;
  reviews: string | number;
  security_files: string | number;
  state: string;
  successful_checks: string | number;
  test_files: string | number;
  title: string;
  total_additions: string | number;
  total_changes: string | number;
  total_deletions: string | number;
  updated_at: Date | string | null;
};

export async function getGithubPrReviewDashboard(
  sql: SqlClient,
): Promise<GithubPrReviewDashboard> {
  const rows = await sql<GithubPrReviewSqlRow[]>`
    with file_stats as (
      select
        pull_request_id,
        count(*) as file_count,
        coalesce(sum(additions), 0) as total_additions,
        coalesce(sum(deletions), 0) as total_deletions,
        coalesce(sum(changes), 0) as total_changes,
        count(*) filter (
          where filename ~* '(^|/)(__tests__|tests?|spec)(/|$)|\\.(test|spec)\\.[cm]?[jt]sx?$|\\.(test|spec)\\.py$'
        ) as test_files,
        count(*) filter (
          where filename ~* '(^|/)(auth|security|middleware|proxy|env|secrets?|permissions?|policies?)(/|\\.|$)'
        ) as security_files,
        count(*) filter (
          where filename ~* '(^|/)(infra|\\.github|deploy|k8s|terraform|supabase|migrations?)(/|$)|vercel\\.json$|dockerfile$|docker-compose\\.(yml|yaml)$'
        ) as infra_files,
        count(*) filter (
          where filename ~* 'architecture|system-design|diagram|adr'
        ) as architecture_files,
        count(*) filter (
          where filename ~* '(^|/)(api|server|db|database|worker|packages)/|route\\.[tj]s$|controller|service|repository'
        ) as backend_files,
        count(*) filter (
          where filename ~* '(^|/)(app|pages|components|ui)/|\\.(tsx|jsx|css)$'
        ) as frontend_files,
        array_agg(filename order by changes desc, filename) as files
      from github_pr_files
      group by pull_request_id
    ),
    review_stats as (
      select
        pull_request_id,
        count(*) as reviews,
        count(*) filter (where state ilike 'approved') as approval_reviews,
        count(*) filter (where state ilike 'changes_requested') as changes_requested_reviews,
        coalesce(sum(comment_count), 0) as review_comments,
        jsonb_agg(
          jsonb_build_object(
            'commentCount', comment_count,
            'htmlUrl', html_url,
            'id', id,
            'reviewerLogin', reviewer_login,
            'state', state,
            'submittedAt', submitted_at
          )
          order by submitted_at asc nulls last, id asc
        ) as review_timeline
      from github_pr_reviews
      group by pull_request_id
    ),
    check_stats as (
      select
        check_run.pull_request_id,
        count(*) as check_count,
        count(*) filter (
          where lower(status) <> 'completed'
        ) as pending_checks,
        count(*) filter (
          where lower(status) = 'completed'
            and lower(conclusion) in ('success', 'neutral', 'skipped')
        ) as successful_checks,
        count(*) filter (
          where lower(status) = 'completed'
            and lower(conclusion) = 'success'
        ) as passed_checks,
        count(*) filter (
          where lower(status) = 'completed'
            and (
              conclusion is null
              or lower(conclusion) not in ('success', 'neutral', 'skipped')
            )
        ) as failed_checks
      from github_pr_checks check_run
      join github_pull_requests pr on pr.id = check_run.pull_request_id
      where pr.head_sha is null or check_run.head_sha = pr.head_sha
      group by check_run.pull_request_id
    )
    select
      repo.full_name as repo_full_name,
      pr.number,
      pr.title,
      pr.state,
      pr.html_url,
      pr.merged_at,
      pr.updated_at,
      coalesce(file_stats.file_count, 0) as file_count,
      coalesce(file_stats.total_additions, 0) as total_additions,
      coalesce(file_stats.total_deletions, 0) as total_deletions,
      coalesce(file_stats.total_changes, 0) as total_changes,
      coalesce(file_stats.test_files, 0) as test_files,
      coalesce(file_stats.security_files, 0) as security_files,
      coalesce(file_stats.infra_files, 0) as infra_files,
      coalesce(file_stats.architecture_files, 0) as architecture_files,
      coalesce(file_stats.backend_files, 0) as backend_files,
      coalesce(file_stats.frontend_files, 0) as frontend_files,
      coalesce(file_stats.files, '{}') as files,
      coalesce(review_stats.reviews, 0) as reviews,
      coalesce(review_stats.approval_reviews, 0) as approval_reviews,
      coalesce(review_stats.changes_requested_reviews, 0) as changes_requested_reviews,
      coalesce(review_stats.review_comments, 0) as review_comments,
      coalesce(review_stats.review_timeline, '[]'::jsonb) as review_timeline,
      coalesce(check_stats.check_count, 0) as check_count,
      coalesce(check_stats.pending_checks, 0) as pending_checks,
      coalesce(check_stats.successful_checks, 0) as successful_checks,
      coalesce(check_stats.passed_checks, 0) as passed_checks,
      coalesce(check_stats.failed_checks, 0) as failed_checks
    from github_pull_requests pr
    join github_repos repo on repo.id = pr.repo_id
    left join file_stats on file_stats.pull_request_id = pr.id
    left join review_stats on review_stats.pull_request_id = pr.id
    left join check_stats on check_stats.pull_request_id = pr.id
    order by coalesce(pr.updated_at, pr.merged_at, pr.synced_at) desc
    limit 200
  `;

  return buildGithubPrReviewDashboard(rows.map((row) => ({
    approvalReviews: Number(row.approval_reviews),
    architectureFiles: Number(row.architecture_files),
    backendFiles: Number(row.backend_files),
    changesRequestedReviews: Number(row.changes_requested_reviews),
    checkCount: Number(row.check_count),
    failedChecks: Number(row.failed_checks),
    fileCount: Number(row.file_count),
    files: row.files ?? [],
    frontendFiles: Number(row.frontend_files),
    htmlUrl: row.html_url,
    infraFiles: Number(row.infra_files),
    mergedAt: row.merged_at ? toIso(row.merged_at) : null,
    number: row.number,
    passedChecks: Number(row.passed_checks),
    pendingChecks: Number(row.pending_checks),
    repoFullName: row.repo_full_name,
    reviewComments: Number(row.review_comments),
    reviewTimeline: parseReviewTimeline(row.review_timeline),
    reviews: Number(row.reviews),
    securityFiles: Number(row.security_files),
    state: row.state,
    successfulChecks: Number(row.successful_checks),
    testFiles: Number(row.test_files),
    title: row.title,
    totalAdditions: Number(row.total_additions),
    totalChanges: Number(row.total_changes),
    totalDeletions: Number(row.total_deletions),
    updatedAt: row.updated_at ? toIso(row.updated_at) : null,
  })));
}

export function buildGithubPrReviewDashboard(rows: GithubPrReviewRow[]): GithubPrReviewDashboard {
  const pullRequests = rows.map(toReviewItem);

  return {
    totals: {
      failingCiPullRequests: pullRequests.filter((item) => item.ciHealth === "failing").length,
      filesChanged: rows.reduce((total, row) => total + row.fileCount, 0),
      highRiskPullRequests: pullRequests.filter((item) => item.riskLevel === "high").length,
      passingCiPullRequests: pullRequests.filter((item) => item.ciHealth === "passing").length,
      pullRequests: rows.length,
      reviews: rows.reduce((total, row) => total + row.reviews, 0),
    },
    pullRequests,
  };
}

function toReviewItem(row: GithubPrReviewRow): GithubPrReviewItem {
  const ciHealth = ciHealthFor(row);
  const riskLevel = riskLevelFor(row, ciHealth);
  const testQuality = testQualityFor(row);
  const reviewState = reviewStateFor(row);
  const architectureImpact = architectureImpactFor(row);
  const codeSmellScore = codeSmellScoreFor(row, testQuality);
  const securityIssues = securityIssuesFor(row, testQuality);
  const prQualityScore = prQualityScoreFor(row, testQuality, reviewState, ciHealth, codeSmellScore);

  return {
    architectureImpact,
    ciChecks: row.checkCount,
    ciHealth,
    ciSummary: ciSummaryFor(row, ciHealth),
    codeSmellScore,
    complexity: complexityFor(row),
    filesChanged: row.fileCount,
    learningExtracted: learningFor(row, testQuality, architectureImpact),
    mergeStatus: mergeStatusFor(row),
    number: row.number,
    prQualityScore,
    prType: prTypeFor(row),
    repoFullName: row.repoFullName,
    resumeWorthyImpact: resumeImpactFor(row, prQualityScore, architectureImpact),
    reviewComments: row.reviewComments,
    reviewState,
    reviewTimeline: sortedReviewTimeline(row.reviewTimeline ?? []),
    riskLevel,
    securityIssues,
    summary: `${row.repoFullName}#${row.number} ${row.title}`,
    testQuality,
    title: row.title,
    topFiles: row.files.slice(0, 6),
    totalChanges: row.totalChanges,
    url: row.htmlUrl,
    updatedAt: row.updatedAt,
  };
}

function riskLevelFor(
  row: GithubPrReviewRow,
  ciHealth: GithubPrReviewItem["ciHealth"],
) {
  if (
    ciHealth === "failing" ||
    row.totalChanges >= 800 ||
    row.fileCount >= 20 ||
    row.changesRequestedReviews > 0 ||
    (row.securityFiles > 0 && row.totalChanges >= 200)
  ) {
    return "high" as const;
  }

  if (
    row.totalChanges >= 200 ||
    row.fileCount >= 8 ||
    row.infraFiles > 0 ||
    (row.backendFiles > 0 && row.frontendFiles > 0)
  ) {
    return "medium" as const;
  }

  return "low" as const;
}

function prTypeFor(row: GithubPrReviewRow): GithubPrType {
  const title = row.title.toLowerCase();
  const conventionalPrefix = /^(?<type>build|chore|ci|docs|feat|fix|perf|refactor|style|test)(\(.+\))?!?:/.exec(title)?.groups?.type;

  if (conventionalPrefix !== undefined) {
    switch (conventionalPrefix) {
      case "docs":
        return "docs";
      case "fix":
        return "bug";
      case "test":
        return "test";
      case "feat":
        return "feature";
      default:
        return "refactor";
    }
  }

  const docFiles = row.files.filter((file) =>
    /\.(md|mdx|rst|txt)$|(^|\/)docs?\//i.test(file)
    // .txt files that are really dependency/build/config manifests, not docs.
    && !/(^|\/)(requirements[^/]*|constraints[^/]*|cmakelists|robots)\.txt$/i.test(file),
  ).length;

  if (row.fileCount > 0 && docFiles === row.fileCount) {
    return "docs";
  }

  if (row.fileCount > 0 && row.testFiles === row.fileCount) {
    return "test";
  }

  if (/\b(bug|fix(es|ed)?|hotfix|regression|patch)\b/.test(title)) {
    return "bug";
  }

  if (/\b(refactor(s|ed|ing)?|cleanup|clean up|rename|restructure|simplify|extract|chore)\b/.test(title)) {
    return "refactor";
  }

  if (/\b(docs?|documentation|readme)\b/.test(title)) {
    return "docs";
  }

  if (/\b(tests?|spec|coverage)\b/.test(title) && row.testFiles > 0) {
    return "test";
  }

  return "feature";
}

function complexityFor(row: GithubPrReviewRow): GithubPrComplexity {
  const touchedAreas = [
    row.backendFiles > 0,
    row.frontendFiles > 0,
    row.infraFiles > 0,
    row.testFiles > 0,
  ].filter(Boolean).length;

  if (row.totalChanges >= 600 || row.fileCount >= 15 || touchedAreas >= 4) {
    return "high";
  }

  if (row.totalChanges >= 150 || row.fileCount >= 6 || touchedAreas >= 2) {
    return "medium";
  }

  return "low";
}

function ciHealthFor(row: GithubPrReviewRow): GithubPrReviewItem["ciHealth"] {
  if (row.checkCount === 0) {
    return "unavailable";
  }

  if (row.failedChecks > 0) {
    return "failing";
  }

  if (row.pendingChecks > 0) {
    return "pending";
  }

  if (row.passedChecks > 0 && row.successfulChecks === row.checkCount) {
    return "passing";
  }

  return "inconclusive";
}

function ciSummaryFor(
  row: GithubPrReviewRow,
  ciHealth: GithubPrReviewItem["ciHealth"],
) {
  switch (ciHealth) {
    case "passing":
      return `${row.passedChecks} of ${row.checkCount} imported GitHub check-run(s) passed.`;
    case "failing":
      return `${row.failedChecks} of ${row.checkCount} imported CI check(s) failed.`;
    case "inconclusive":
      return "Imported GitHub check-run evidence is neutral or skipped only; no successful CI run was found.";
    case "pending":
      return `${row.pendingChecks} of ${row.checkCount} imported CI check(s) are still pending.`;
    case "unavailable":
      return "No GitHub check-run evidence has been imported for this pull request.";
  }
}

function testQualityFor(row: GithubPrReviewRow) {
  if (row.testFiles === 0) {
    return "missing" as const;
  }

  if (row.testFiles >= 2 || row.testFiles / Math.max(row.fileCount, 1) >= 0.2) {
    return "strong" as const;
  }

  return "partial" as const;
}

function reviewStateFor(row: GithubPrReviewRow) {
  if (row.changesRequestedReviews > 0) {
    return "changes-requested" as const;
  }

  if (row.approvalReviews > 0) {
    return "approved" as const;
  }

  return row.reviews > 0 ? "reviewed" as const : "unreviewed" as const;
}

function sortedReviewTimeline(items: GithubPrReviewTimelineItem[]) {
  return [...items].sort((left, right) =>
    compareNullableIso(left.submittedAt, right.submittedAt)
      || left.id - right.id,
  );
}

function parseReviewTimeline(value: unknown): GithubPrReviewTimelineItem[] {
  const items = typeof value === "string" ? safeJsonParse(value) : value;

  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(parseReviewTimelineItem).filter((item): item is GithubPrReviewTimelineItem => item !== null);
}

function parseReviewTimelineItem(value: unknown): GithubPrReviewTimelineItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = Number(record.id);
  const commentCount = Number(record.commentCount ?? 0);
  const state = typeof record.state === "string" ? record.state : undefined;

  if (!Number.isFinite(id) || state === undefined) {
    return null;
  }

  return {
    commentCount: Number.isFinite(commentCount) ? commentCount : 0,
    htmlUrl: typeof record.htmlUrl === "string" ? record.htmlUrl : null,
    id,
    reviewerLogin: typeof record.reviewerLogin === "string" ? record.reviewerLogin : null,
    state,
    submittedAt: typeof record.submittedAt === "string" ? toIso(record.submittedAt) : null,
  };
}

function mergeStatusFor(row: GithubPrReviewRow) {
  if (row.mergedAt) {
    return "merged" as const;
  }

  return row.state.toLowerCase() === "open" ? "open" as const : "closed" as const;
}

function architectureImpactFor(row: GithubPrReviewRow) {
  if (
    row.architectureFiles > 0 ||
    row.fileCount >= 15 ||
    (row.backendFiles > 0 && row.frontendFiles > 0 && row.infraFiles > 0)
  ) {
    return "high" as const;
  }

  if (row.backendFiles > 0 || row.frontendFiles > 0 || row.infraFiles > 0) {
    return "medium" as const;
  }

  return "low" as const;
}

function codeSmellScoreFor(
  row: GithubPrReviewRow,
  testQuality: GithubPrReviewItem["testQuality"],
) {
  const missingTestPenalty = testQuality === "missing" ? 18 : testQuality === "partial" ? 8 : 0;

  return Math.min(
    100,
    Math.round(
      row.fileCount * 3 +
      row.totalChanges / 20 +
      row.changesRequestedReviews * 15 +
      row.securityFiles * 8 +
      missingTestPenalty,
    ),
  );
}

function securityIssuesFor(
  row: GithubPrReviewRow,
  testQuality: GithubPrReviewItem["testQuality"],
) {
  const issues: string[] = [];

  if (row.securityFiles > 0) {
    issues.push("Auth, middleware, env, or permission-sensitive files changed.");
  }

  if (row.securityFiles > 0 && testQuality === "missing") {
    issues.push("Security-sensitive change has no imported test-file evidence.");
  }

  if (row.totalChanges >= 800) {
    issues.push("Large diff requires manual security review.");
  }

  return issues;
}

function prQualityScoreFor(
  row: GithubPrReviewRow,
  testQuality: GithubPrReviewItem["testQuality"],
  reviewState: GithubPrReviewItem["reviewState"],
  ciHealth: GithubPrReviewItem["ciHealth"],
  codeSmellScore: number,
) {
  const testScore = testQuality === "strong" ? 20 : testQuality === "partial" ? 10 : 0;
  const reviewScore = reviewState === "approved" ? 15 : reviewState === "reviewed" ? 8 : 0;
  const ciHealthScore = ciHealth === "passing" ? 10 : ciHealth === "pending" ? 3 : 0;
  const securityScore = row.securityFiles === 0 ? 10 : 5;
  const clarityScore = row.title.trim().length >= 12 ? 25 : 12;
  const structureScore = Math.max(0, 15 - Math.floor(codeSmellScore / 10));
  const documentationScore = row.architectureFiles > 0 || row.files.some((file) => /readme|docs?\//i.test(file)) ? 5 : 0;

  return Math.min(100, clarityScore + testScore + structureScore + reviewScore + ciHealthScore + securityScore + documentationScore);
}

function learningFor(
  row: GithubPrReviewRow,
  testQuality: GithubPrReviewItem["testQuality"],
  architectureImpact: GithubPrReviewItem["architectureImpact"],
) {
  const signals = [
    row.testFiles > 0 ? "Testing evidence attached to PR." : undefined,
    row.reviews > 0 ? "Review feedback loop captured." : undefined,
    row.checkCount > 0 ? ciSummaryFor(row, ciHealthFor(row)) : undefined,
    architectureImpact !== "low" ? "Architecture-impacting change visible." : undefined,
    row.securityFiles > 0 ? "Security-sensitive change requires careful validation." : undefined,
    testQuality === "missing" ? "Add test proof before treating this PR as portfolio evidence." : undefined,
  ].filter((signal): signal is string => signal !== undefined);

  return signals.length > 0 ? signals : ["Small PR with limited imported learning signals."];
}

function resumeImpactFor(
  row: GithubPrReviewRow,
  prQualityScore: number,
  architectureImpact: GithubPrReviewItem["architectureImpact"],
) {
  if (row.mergedAt && prQualityScore >= 75 && architectureImpact !== "low") {
    return "Strong resume evidence: merged, reviewed, tested, and architecture-relevant.";
  }

  if (row.mergedAt && prQualityScore >= 60) {
    return "Usable engineering evidence after adding concise outcome notes.";
  }

  if (row.state.toLowerCase() === "open") {
    return "Not resume-ready yet: finish review, merge, and validation proof first.";
  }

  return "Weak resume evidence until outcome and validation are clearer.";
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function compareNullableIso(left: string | null | undefined, right: string | null | undefined) {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  return new Date(left).getTime() - new Date(right).getTime();
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}
