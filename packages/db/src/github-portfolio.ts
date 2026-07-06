import type { SqlClient } from "./client.js";

// Repo Portfolio Score rubric (Task.md section 15) mapped to importable
// GitHub evidence. Factors that need human judgment (problem clarity,
// uniqueness) use documented proxies: README + merged-PR proof for clarity,
// absence of tutorial-like signals for uniqueness.
const PORTFOLIO_RUBRIC_POINTS = {
  architectureQuality: 15,
  codeQuality: 15,
  deploymentDemo: 10,
  problemClarity: 20,
  readmeDocs: 10,
  technicalDepth: 10,
  testsCi: 15,
  uniqueness: 5,
} as const;
const MAX_PORTFOLIO_SCORE = Object.values(PORTFOLIO_RUBRIC_POINTS)
  .reduce((total, points) => total + points, 0);

const tutorialNamePattern =
  /(tutorial|course|learn(ing)?|practice|playground|example|demo|clone|starter|template|bootcamp|udemy|freecodecamp|training|exercise)/i;

const backendStackSignals = new Set([
  ".net",
  "api",
  "c#",
  "database",
  "django",
  "express",
  "fastapi",
  "fastify",
  "flask",
  "go",
  "golang",
  "graphql",
  "java",
  "kafka",
  "kotlin",
  "mysql",
  "nest",
  "node",
  "node.js",
  "postgres",
  "postgresql",
  "python",
  "redis",
  "rust",
  "server",
  "spring",
  "supabase",
]);

export interface GithubPortfolioDashboard {
  totals: {
    commits: number;
    profiledRepos: number;
    pullRequests: number;
    repos: number;
    unavailableProfiles: number;
  };
  bestRepos: GithubPortfolioRepo[];
  weakRepos: GithubPortfolioRepo[];
  needsArchitectureDiagram: GithubPortfolioRepo[];
  needsDeployment: GithubPortfolioRepo[];
  needsReadme: GithubPortfolioRepo[];
  needsTests: GithubPortfolioRepo[];
  techStackDistribution: Array<{
    count: number;
    technology: string;
  }>;
  commitConsistency: Array<{
    commitsLast30Days: number;
    commitsLast90Days: number;
    lastCommitAt?: string;
    repoFullName: string;
    status: "consistent" | "inactive" | "new-or-light";
  }>;
  prQuality: Array<{
    mergedPullRequests: number;
    openPullRequests: number;
    pullRequests: number;
    repoFullName: string;
    score: number;
  }>;
  projectComplexity: Array<{
    band: "high" | "low" | "medium";
    repoFullName: string;
    score: number;
    signals: string[];
  }>;
}

export interface GithubPortfolioRepo {
  commitCount: number;
  fullName: string;
  hasArchitectureDiagram: boolean | null;
  hasDeploymentConfig: boolean | null;
  hasReadme: boolean | null;
  hasTests: boolean | null;
  htmlUrl: string | null;
  language: string | null;
  lastCommitAt?: string;
  portfolioScore: number;
  profileStatus: "missing" | "scanned" | "unavailable";
  pullRequestCount: number;
  reasons: string[];
  statusLabels: string[];
  techStack: string[];
}

export interface GithubPortfolioRepoRow {
  commits: number;
  commitsLast30Days: number;
  commitsLast90Days: number;
  fullName: string;
  hasArchitectureDiagram: boolean | null;
  hasDeploymentConfig: boolean | null;
  hasReadme: boolean | null;
  hasTests: boolean | null;
  htmlUrl: string | null;
  language: string | null;
  lastCommitAt: string | null;
  mergedPullRequests: number;
  openPullRequests: number;
  profileScannedAt: string | null;
  pullRequests: number;
  scanStatus: "scanned" | "unavailable" | null;
  techStack: string[];
}

type GithubPortfolioSqlRow = {
  commits: string | number;
  commits_last_30_days: string | number;
  commits_last_90_days: string | number;
  full_name: string;
  has_architecture_diagram: boolean | null;
  has_deployment_config: boolean | null;
  has_readme: boolean | null;
  has_tests: boolean | null;
  html_url: string | null;
  language: string | null;
  last_commit_at: Date | string | null;
  merged_pull_requests: string | number;
  open_pull_requests: string | number;
  profile_scanned_at: Date | string | null;
  pull_requests: string | number;
  scan_status: "scanned" | "unavailable" | null;
  tech_stack: string[] | null;
};

export async function getGithubPortfolioDashboard(
  sql: SqlClient,
): Promise<GithubPortfolioDashboard> {
  const rows = await sql<GithubPortfolioSqlRow[]>`
    select
      repo.full_name,
      repo.html_url,
      repo.language,
      profile.scan_status,
      profile.has_readme,
      profile.has_tests,
      profile.has_deployment_config,
      profile.has_architecture_diagram,
      profile.tech_stack,
      profile.scanned_at as profile_scanned_at,
      count(distinct commit.sha) as commits,
      count(distinct commit.sha) filter (
        where commit.committed_at >= now() - interval '30 days'
      ) as commits_last_30_days,
      count(distinct commit.sha) filter (
        where commit.committed_at >= now() - interval '90 days'
      ) as commits_last_90_days,
      max(commit.committed_at) as last_commit_at,
      count(distinct pr.id) as pull_requests,
      count(distinct pr.id) filter (where pr.merged_at is not null) as merged_pull_requests,
      count(distinct pr.id) filter (where pr.state = 'open') as open_pull_requests
    from github_repos repo
    left join github_repo_profiles profile on profile.repo_id = repo.id
    left join github_commits commit on commit.repo_id = repo.id
    left join github_pull_requests pr on pr.repo_id = repo.id
    group by
      repo.id,
      repo.full_name,
      repo.html_url,
      repo.language,
      profile.scan_status,
      profile.has_readme,
      profile.has_tests,
      profile.has_deployment_config,
      profile.has_architecture_diagram,
      profile.tech_stack,
      profile.scanned_at
    order by coalesce(repo.updated_at, repo.pushed_at, repo.synced_at) desc
    limit 500
  `;

  return buildGithubPortfolioDashboard({
    now: new Date(),
    rows: rows.map((row) => ({
      commits: Number(row.commits),
      commitsLast30Days: Number(row.commits_last_30_days),
      commitsLast90Days: Number(row.commits_last_90_days),
      fullName: row.full_name,
      hasArchitectureDiagram: row.has_architecture_diagram,
      hasDeploymentConfig: row.has_deployment_config,
      hasReadme: row.has_readme,
      hasTests: row.has_tests,
      htmlUrl: row.html_url,
      language: row.language,
      lastCommitAt: row.last_commit_at ? toIso(row.last_commit_at) : null,
      mergedPullRequests: Number(row.merged_pull_requests),
      openPullRequests: Number(row.open_pull_requests),
      profileScannedAt: row.profile_scanned_at ? toIso(row.profile_scanned_at) : null,
      pullRequests: Number(row.pull_requests),
      scanStatus: row.scan_status,
      techStack: row.tech_stack ?? [],
    })),
  });
}

export function buildGithubPortfolioDashboard(input: {
  now: Date;
  rows: GithubPortfolioRepoRow[];
}): GithubPortfolioDashboard {
  const repos = input.rows.map((row) => toPortfolioRepo(row, input.now));
  const scannedRepos = repos.filter((repo) => repo.profileStatus === "scanned");
  const techCounts = new Map<string, number>();

  for (const repo of repos) {
    const stack = repo.techStack.length > 0
      ? repo.techStack
      : repo.language
        ? [repo.language]
        : [];

    for (const technology of stack) {
      techCounts.set(technology, (techCounts.get(technology) ?? 0) + 1);
    }
  }

  return {
    totals: {
      commits: input.rows.reduce((total, row) => total + row.commits, 0),
      profiledRepos: scannedRepos.length,
      pullRequests: input.rows.reduce((total, row) => total + row.pullRequests, 0),
      repos: repos.length,
      unavailableProfiles: repos.filter((repo) => repo.profileStatus === "unavailable").length,
    },
    bestRepos: [...repos].sort(byScoreDesc).slice(0, 8),
    weakRepos: [...repos].sort(byScoreAsc).slice(0, 8),
    needsArchitectureDiagram: scannedRepos.filter((repo) => repo.hasArchitectureDiagram === false).slice(0, 12),
    needsDeployment: scannedRepos.filter((repo) => repo.hasDeploymentConfig === false).slice(0, 12),
    needsReadme: scannedRepos.filter((repo) => repo.hasReadme === false).slice(0, 12),
    needsTests: scannedRepos.filter((repo) => repo.hasTests === false).slice(0, 12),
    techStackDistribution: [...techCounts.entries()]
      .map(([technology, count]) => ({ technology, count }))
      .sort((first, second) => second.count - first.count || first.technology.localeCompare(second.technology)),
    commitConsistency: input.rows
      .map((row) => ({
        commitsLast30Days: row.commitsLast30Days,
        commitsLast90Days: row.commitsLast90Days,
        ...(row.lastCommitAt ? { lastCommitAt: row.lastCommitAt } : {}),
        repoFullName: row.fullName,
        status: commitConsistencyStatus(row, input.now),
      }))
      .sort((first, second) => second.commitsLast30Days - first.commitsLast30Days),
    prQuality: input.rows
      .map((row) => ({
        mergedPullRequests: row.mergedPullRequests,
        openPullRequests: row.openPullRequests,
        pullRequests: row.pullRequests,
        repoFullName: row.fullName,
        score: pullRequestQualityScore(row),
      }))
      .sort((first, second) => second.score - first.score),
    projectComplexity: repos
      .map((repo) => projectComplexity(repo))
      .sort((first, second) => second.score - first.score),
  };
}

function toPortfolioRepo(row: GithubPortfolioRepoRow, now: Date): GithubPortfolioRepo {
  const profileStatus = row.scanStatus ?? "missing";
  const reasons = portfolioReasons(row, now, profileStatus);
  const portfolioScore = scorePortfolio(row);
  const techStack = row.techStack.length > 0
    ? row.techStack
    : row.language
      ? [row.language]
      : [];

  return {
    commitCount: row.commits,
    fullName: row.fullName,
    hasArchitectureDiagram: row.hasArchitectureDiagram,
    hasDeploymentConfig: row.hasDeploymentConfig,
    hasReadme: row.hasReadme,
    hasTests: row.hasTests,
    htmlUrl: row.htmlUrl,
    language: row.language,
    ...(row.lastCommitAt ? { lastCommitAt: row.lastCommitAt } : {}),
    portfolioScore,
    profileStatus,
    pullRequestCount: row.pullRequests,
    reasons,
    statusLabels: statusLabelsFor(row, portfolioScore, profileStatus),
    techStack,
  };
}

function scorePortfolio(row: GithubPortfolioRepoRow) {
  const stackSignals = row.techStack.length || (row.language ? 1 : 0);
  const mergedRatio = row.pullRequests > 0
    ? Math.min(1, Math.max(0, row.mergedPullRequests / row.pullRequests))
    : 0;
  const problemClarity =
    booleanPoints(row.hasReadme, 12) +
    (row.mergedPullRequests > 0 ? 8 : 0);
  const architectureQuality =
    booleanPoints(row.hasArchitectureDiagram, 10) +
    (stackSignals >= 2 ? 5 : 0);
  const codeQuality = mergedRatio * PORTFOLIO_RUBRIC_POINTS.codeQuality;
  const testsCi = booleanPoints(row.hasTests, PORTFOLIO_RUBRIC_POINTS.testsCi);
  const deploymentDemo = booleanPoints(
    row.hasDeploymentConfig,
    PORTFOLIO_RUBRIC_POINTS.deploymentDemo,
  );
  const readmeDocs = booleanPoints(row.hasReadme, PORTFOLIO_RUBRIC_POINTS.readmeDocs);
  const technicalDepth =
    boundedRatio(row.commits, 40) * 5 + boundedRatio(stackSignals, 4) * 5;
  const uniqueness = isTutorialLike(row) ? 0 : PORTFOLIO_RUBRIC_POINTS.uniqueness;
  const rawScore =
    problemClarity +
    architectureQuality +
    codeQuality +
    testsCi +
    deploymentDemo +
    readmeDocs +
    technicalDepth +
    uniqueness;

  return Math.max(0, Math.min(MAX_PORTFOLIO_SCORE, Math.round(rawScore)));
}

function isTutorialLike(row: GithubPortfolioRepoRow) {
  if (tutorialNamePattern.test(row.fullName.split("/").pop() ?? row.fullName)) {
    return true;
  }

  return (
    row.scanStatus === "scanned" &&
    row.hasTests === false &&
    row.pullRequests <= 0 &&
    !(row.commits >= 10)
  );
}

function hasBackendStack(row: GithubPortfolioRepoRow) {
  const signals = [...row.techStack, ...(row.language ? [row.language] : [])];

  return signals.some((signal) => backendStackSignals.has(signal.trim().toLowerCase()));
}

function statusLabelsFor(
  row: GithubPortfolioRepoRow,
  portfolioScore: number,
  profileStatus: GithubPortfolioRepo["profileStatus"],
) {
  const labels: string[] = [];
  const resumeReady =
    portfolioScore >= 70 &&
    row.hasReadme === true &&
    row.hasTests === true &&
    row.mergedPullRequests > 0;

  if (resumeReady) {
    labels.push("This repo is resume-ready.");
  }

  if (profileStatus === "scanned") {
    if (row.hasReadme === false) labels.push("This repo needs README.");
    if (row.hasTests === false) labels.push("This repo needs tests.");
    if (row.hasDeploymentConfig === false) labels.push("This repo needs deployed demo.");
  }

  if (isTutorialLike(row)) {
    labels.push("This repo is too tutorial-like.");
  }

  if (hasBackendStack(row) && row.hasTests === true && row.commits >= 20) {
    labels.push("This repo has strong backend depth.");
  }

  if (!resumeReady && portfolioScore < 35) {
    labels.push("This repo does not prove SDE skill yet.");
  }

  return labels;
}

function portfolioReasons(
  row: GithubPortfolioRepoRow,
  now: Date,
  profileStatus: GithubPortfolioRepo["profileStatus"],
) {
  const reasons: string[] = [];

  if (profileStatus === "missing") {
    reasons.push("Run GitHub backfill profile scan.");
  }

  if (profileStatus === "unavailable") {
    reasons.push("GitHub contents access unavailable.");
  }

  if (profileStatus === "scanned") {
    if (row.hasReadme === false) reasons.push("README missing.");
    if (row.hasTests === false) reasons.push("Test evidence missing.");
    if (row.hasDeploymentConfig === false) reasons.push("Deployment config missing.");
    if (row.hasArchitectureDiagram === false) reasons.push("Architecture diagram missing.");
  }

  if (row.commits === 0) {
    reasons.push("No commits imported.");
  } else if (!row.lastCommitAt || daysSince(row.lastCommitAt, now) > 90) {
    reasons.push("No recent commit evidence.");
  }

  if (row.pullRequests === 0) {
    reasons.push("No PR evidence imported.");
  }

  return reasons.length > 0 ? reasons : ["Strong portfolio evidence."];
}

function booleanPoints(value: boolean | null, points: number) {
  return value === true ? points : 0;
}

function boundedRatio(value: number, maximum: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(value, maximum) / maximum;
}

function commitConsistencyStatus(row: GithubPortfolioRepoRow, now: Date) {
  if (!row.lastCommitAt || daysSince(row.lastCommitAt, now) > 90) {
    return "inactive" as const;
  }

  if (row.commitsLast30Days >= 4 || row.commitsLast90Days >= 12) {
    return "consistent" as const;
  }

  return "new-or-light" as const;
}

function pullRequestQualityScore(row: GithubPortfolioRepoRow) {
  if (row.pullRequests === 0) {
    return 0;
  }

  const mergedRatio = row.mergedPullRequests / row.pullRequests;
  const volumeScore = Math.min(row.pullRequests, 10) / 10;

  return Math.round((mergedRatio * 0.7 + volumeScore * 0.3) * 100);
}

function projectComplexity(repo: GithubPortfolioRepo) {
  const signals = [
    repo.techStack.length >= 3 ? "multi-stack" : undefined,
    repo.commitCount >= 40 ? "substantial commit history" : undefined,
    repo.pullRequestCount >= 8 ? "PR-driven development" : undefined,
    repo.hasDeploymentConfig ? "deployment config" : undefined,
    repo.hasArchitectureDiagram ? "architecture documentation" : undefined,
  ].filter((signal): signal is string => signal !== undefined);
  const score = Math.min(100, signals.length * 20 + Math.min(repo.commitCount, 20));

  return {
    band: score >= 70 ? "high" as const : score >= 35 ? "medium" as const : "low" as const,
    repoFullName: repo.fullName,
    score,
    signals,
  };
}

function byScoreDesc(first: GithubPortfolioRepo, second: GithubPortfolioRepo) {
  return second.portfolioScore - first.portfolioScore || first.fullName.localeCompare(second.fullName);
}

function byScoreAsc(first: GithubPortfolioRepo, second: GithubPortfolioRepo) {
  return first.portfolioScore - second.portfolioScore || first.fullName.localeCompare(second.fullName);
}

function daysSince(value: string, now: Date) {
  return Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000);
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
