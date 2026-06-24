import type { Octokit } from "@octokit/rest";
import type {
  GithubBackfillOptions,
  GithubBackfillResult,
  GithubCommitSummary,
  GithubPullRequestFileSummary,
  GithubPullRequestReviewSummary,
  GithubRepoProfileSummary,
  GithubPullRequestSummary,
  GithubRepoSummary,
} from "./types.js";

export const DEFAULT_GITHUB_COMMIT_LIMIT_PER_REPO = 100;
export const DEFAULT_GITHUB_PR_METADATA_LIMIT_PER_REPO = 25;
export const DEFAULT_GITHUB_PULL_REQUEST_LIMIT_PER_REPO = 100;
export const DEFAULT_GITHUB_REPO_LIMIT = 10;
const MAX_GITHUB_COMMIT_LIMIT_PER_REPO = 100;
const MAX_GITHUB_CONCURRENCY = 5;
const MAX_GITHUB_PR_METADATA_LIMIT_PER_REPO = 100;
const MAX_GITHUB_PULL_REQUEST_LIMIT_PER_REPO = 100;
const MAX_GITHUB_REPO_LIMIT = 100;
const DEFAULT_GITHUB_CONCURRENCY = 2;
const DEFAULT_GITHUB_MINIMUM_RATE_LIMIT_REMAINING = 100;
const PROFILE_SCAN_PATHS = [
  "",
  ".github",
  ".github/workflows",
  "app",
  "apps",
  "docs",
  "documentation",
  "infra",
  "packages",
  "src",
  "spec",
  "test",
  "tests",
];

function mapRepo(
  repo: Awaited<ReturnType<Octokit["repos"]["listForUser"]>>["data"][number],
): GithubRepoSummary {
  return {
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch ?? null,
    htmlUrl: repo.html_url ?? null,
    language: repo.language ?? null,
    pushedAt: repo.pushed_at ?? null,
    updatedAt: repo.updated_at ?? null,
  };
}

function mapCommit(
  commit: Awaited<ReturnType<Octokit["repos"]["listCommits"]>>["data"][number],
  repo: GithubRepoSummary,
  branch: string | null,
): GithubCommitSummary {
  return {
    authorLogin: commit.author?.login ?? null,
    branch,
    committedAt: commit.commit.author?.date ?? commit.commit.committer?.date ?? null,
    htmlUrl: commit.html_url ?? null,
    message: commit.commit.message,
    repoFullName: repo.fullName,
    sha: commit.sha,
  };
}

export async function backfillGithubUser(
  octokit: Octokit,
  username: string,
  options: GithubBackfillOptions = {},
): Promise<GithubBackfillResult> {
  const commitLimit = normalizedCommitLimit(options.commitLimitPerRepo);
  const concurrency = normalizedBoundedPositiveInteger(
    options.concurrency,
    DEFAULT_GITHUB_CONCURRENCY,
    MAX_GITHUB_CONCURRENCY,
  );
  const minimumRateLimitRemaining = normalizedNonNegativeInteger(
    options.minimumRateLimitRemaining,
    DEFAULT_GITHUB_MINIMUM_RATE_LIMIT_REMAINING,
  );
  const prMetadataLimit = normalizedPrMetadataLimit(options.prMetadataLimitPerRepo);
  const pullRequestLimit = normalizedBoundedPositiveInteger(
    options.pullRequestLimitPerRepo,
    DEFAULT_GITHUB_PULL_REQUEST_LIMIT_PER_REPO,
    MAX_GITHUB_PULL_REQUEST_LIMIT_PER_REPO,
  );
  const repoLimit = normalizedBoundedPositiveInteger(
    options.repoLimit,
    DEFAULT_GITHUB_REPO_LIMIT,
    MAX_GITHUB_REPO_LIMIT,
  );
  const repoPage = normalizedBoundedPositiveInteger(options.repoPage, 1, Number.MAX_SAFE_INTEGER);
  const shouldScanPrMetadata = options.prMetadataScan ?? true;
  const shouldScanProfiles = options.profileScan ?? true;
  await assertGithubRateLimit(octokit, minimumRateLimitRemaining, repoPage);
  const repoResponse = await octokit.repos.listForUser({
    direction: "asc",
    page: repoPage,
    per_page: repoLimit,
    username,
    sort: "full_name",
  });
  const repoSummaries = repoResponse.data.map(mapRepo);
  const commits: GithubCommitSummary[] = [];
  const pullRequestFiles: GithubPullRequestFileSummary[] = [];
  const pullRequestReviews: GithubPullRequestReviewSummary[] = [];
  const repoProfiles: GithubRepoProfileSummary[] = [];
  const pullRequests: GithubPullRequestSummary[] = [];

  const repoResults = await mapWithConcurrency(repoSummaries, concurrency, async (repo) => {
    const pulls = await octokit.pulls.list({
      owner: repo.owner,
      repo: repo.name,
      state: "all",
      per_page: pullRequestLimit,
    });

    const repoPullRequests = pulls.data.map((pull) => ({
        id: pull.id,
        repoFullName: repo.fullName,
        number: pull.number,
        title: pull.title,
        state: pull.state,
        htmlUrl: pull.html_url,
        mergedAt: pull.merged_at,
        updatedAt: pull.updated_at,
    }));

    const repoCommits = commitLimit > 0
      ? await listRecentRepoCommits(octokit, repo, commitLimit)
      : [];
    const metadata = shouldScanPrMetadata && prMetadataLimit > 0
      ? await mapWithConcurrency(
          recentPullRequests(repoPullRequests, prMetadataLimit),
          concurrency,
          (pullRequest) => fetchGithubPullRequestMetadata(octokit, repo, pullRequest),
        )
      : [];
    const profile = shouldScanProfiles ? await profileGithubRepo(octokit, repo) : undefined;

    return {
      commits: repoCommits,
      files: metadata.flatMap((item) => item.files),
      profile,
      pullRequests: repoPullRequests,
      reviews: metadata.flatMap((item) => item.reviews),
    };
  });

  for (const result of repoResults) {
    commits.push(...result.commits);
    pullRequestFiles.push(...result.files);
    pullRequestReviews.push(...result.reviews);
    pullRequests.push(...result.pullRequests);
    if (result.profile) repoProfiles.push(result.profile);
  }

  const nextRepoPage = nextPageFromLink(repoResponse.headers.link);

  return {
    checkpoint: {
      complete: nextRepoPage === null,
      nextRepoPage,
      repoLimit,
      repoPage,
    },
    commits,
    pullRequestFiles,
    pullRequestReviews,
    repoProfiles,
    repos: repoSummaries,
    pullRequests,
  };
}

export async function fetchGithubPullRequestMetadata(
  octokit: Octokit,
  repo: GithubRepoSummary,
  pullRequest: GithubPullRequestSummary,
  options: {
    ignoreMissing?: boolean;
  } = {},
): Promise<{
  files: GithubPullRequestFileSummary[];
  reviews: GithubPullRequestReviewSummary[];
}> {
  try {
    const [files, reviews, reviewComments] = await Promise.all([
      octokit.paginate(octokit.pulls.listFiles, {
        owner: repo.owner,
        pull_number: pullRequest.number,
        repo: repo.name,
        per_page: 100,
      }),
      octokit.paginate(octokit.pulls.listReviews, {
        owner: repo.owner,
        pull_number: pullRequest.number,
        repo: repo.name,
        per_page: 100,
      }),
      octokit.paginate(octokit.pulls.listReviewComments, {
        owner: repo.owner,
        pull_number: pullRequest.number,
        repo: repo.name,
        per_page: 100,
      }),
    ]);
    const commentCounts = reviewCommentCounts(reviewComments);

    return {
      files: files.map((file) => ({
        additions: file.additions,
        changes: file.changes,
        deletions: file.deletions,
        filename: file.filename,
        previousFilename: file.previous_filename ?? null,
        pullRequestId: pullRequest.id,
        pullRequestNumber: pullRequest.number,
        repoFullName: repo.fullName,
        status: file.status,
      })),
      reviews: reviews.map((review) => ({
        commentCount: commentCounts.get(review.id) ?? 0,
        htmlUrl: review.html_url ?? null,
        id: review.id,
        pullRequestId: pullRequest.id,
        pullRequestNumber: pullRequest.number,
        repoFullName: repo.fullName,
        reviewerLogin: review.user?.login ?? null,
        state: review.state,
        submittedAt: review.submitted_at ?? null,
      })),
    };
  } catch (error) {
    const status = githubStatus(error);

    if ((status === 404 || status === 410) && options.ignoreMissing !== false) {
      return {
        files: [],
        reviews: [],
      };
    }

    throw error;
  }
}

export async function profileGithubRepo(
  octokit: Octokit,
  repo: GithubRepoSummary,
): Promise<GithubRepoProfileSummary> {
  const scannedAt = new Date().toISOString();
  const entries: RepoContentEntry[] = [];

  try {
    for (const path of PROFILE_SCAN_PATHS) {
      entries.push(...await listRepoDirectory(octokit, repo, path));
    }
  } catch (error) {
    return {
      evidencePaths: [],
      hasArchitectureDiagram: null,
      hasDeploymentConfig: null,
      hasReadme: null,
      hasTests: null,
      repoFullName: repo.fullName,
      scanError: scanErrorMessage(error),
      scannedAt,
      scanStatus: "unavailable",
      techStack: normalizedTechStack([repo.language]),
    };
  }

  const paths = uniqueSorted(entries.map((entry) => entry.path));

  return {
    evidencePaths: portfolioEvidencePaths(paths),
    hasArchitectureDiagram: hasArchitectureDiagram(paths),
    hasDeploymentConfig: hasDeploymentConfig(paths),
    hasReadme: hasReadme(paths),
    hasTests: hasTests(paths),
    repoFullName: repo.fullName,
    scanError: null,
    scannedAt,
    scanStatus: "scanned",
    techStack: normalizedTechStack([
      repo.language,
      ...techStackFromPaths(paths),
    ]),
  };
}

async function listRecentRepoCommits(
  octokit: Octokit,
  repo: GithubRepoSummary,
  limit: number,
): Promise<GithubCommitSummary[]> {
  try {
    const response = await octokit.repos.listCommits({
      owner: repo.owner,
      repo: repo.name,
      ...(repo.defaultBranch ? { sha: repo.defaultBranch } : {}),
      per_page: limit,
    });

    return response.data.map((commit) => mapCommit(commit, repo, repo.defaultBranch));
  } catch (error) {
    if (githubStatus(error) === 409) {
      return [];
    }

    throw error;
  }
}

function normalizedCommitLimit(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_GITHUB_COMMIT_LIMIT_PER_REPO;
  }

  if (!Number.isFinite(value)) {
    return DEFAULT_GITHUB_COMMIT_LIMIT_PER_REPO;
  }

  return Math.max(0, Math.min(Math.floor(value), MAX_GITHUB_COMMIT_LIMIT_PER_REPO));
}

function normalizedPrMetadataLimit(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_GITHUB_PR_METADATA_LIMIT_PER_REPO;
  }

  if (!Number.isFinite(value)) {
    return DEFAULT_GITHUB_PR_METADATA_LIMIT_PER_REPO;
  }

  return Math.max(0, Math.min(Math.floor(value), MAX_GITHUB_PR_METADATA_LIMIT_PER_REPO));
}

function normalizedBoundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(value ?? fallback), maximum));
}

function normalizedNonNegativeInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value ?? fallback));
}

function recentPullRequests(
  pullRequests: GithubPullRequestSummary[],
  limit: number,
) {
  return [...pullRequests]
    .sort((first, second) =>
      timestampValue(second.updatedAt ?? second.mergedAt) - timestampValue(first.updatedAt ?? first.mergedAt),
    )
    .slice(0, limit);
}

function timestampValue(value: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function githubStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
}

async function assertGithubRateLimit(
  octokit: Octokit,
  minimumRemaining: number,
  repoPage: number,
) {
  const response = await octokit.rateLimit.get();
  const core = response.data.resources.core;

  if (core.remaining >= minimumRemaining) {
    return;
  }

  const resetAt = new Date(core.reset * 1_000).toISOString();
  throw new Error(
    `GitHub API rate limit has ${core.remaining} request(s) remaining; `
    + `at least ${minimumRemaining} are required. Retry repo page ${repoPage} after ${resetAt}.`,
  );
}

function nextPageFromLink(link: string | undefined) {
  if (!link) {
    return null;
  }

  for (const part of link.split(",")) {
    if (!part.includes('rel="next"')) {
      continue;
    }

    const match = part.match(/[?&]page=(\d+)/);
    const page = match ? Number(match[1]) : NaN;

    return Number.isInteger(page) && page > 0 ? page : null;
  }

  return null;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index] as T, index);
      }
    }),
  );

  return results;
}

function reviewCommentCounts(comments: Array<{ pull_request_review_id?: number | null }>) {
  const counts = new Map<number, number>();

  for (const comment of comments) {
    if (typeof comment.pull_request_review_id === "number") {
      counts.set(comment.pull_request_review_id, (counts.get(comment.pull_request_review_id) ?? 0) + 1);
    }
  }

  return counts;
}

interface RepoContentEntry {
  name: string;
  path: string;
  type: string;
}

async function listRepoDirectory(
  octokit: Octokit,
  repo: GithubRepoSummary,
  path: string,
): Promise<RepoContentEntry[]> {
  try {
    const response = await octokit.repos.getContent({
      owner: repo.owner,
      path,
      repo: repo.name,
      ...(repo.defaultBranch ? { ref: repo.defaultBranch } : {}),
    });

    if (!Array.isArray(response.data)) {
      return [contentEntry(response.data)];
    }

    return response.data.map(contentEntry);
  } catch (error) {
    const status = githubStatus(error);

    if (status === 404 || status === 409) {
      return [];
    }

    throw error;
  }
}

function contentEntry(value: unknown): RepoContentEntry {
  const record = value as {
    name?: unknown;
    path?: unknown;
    type?: unknown;
  };

  return {
    name: typeof record.name === "string" ? record.name : "",
    path: typeof record.path === "string" ? record.path : "",
    type: typeof record.type === "string" ? record.type : "",
  };
}

function hasReadme(paths: string[]) {
  return paths.some((path) => /^readme(\.|$)/i.test(fileName(path)));
}

function hasTests(paths: string[]) {
  return paths.some((path) => {
    const normalized = path.toLowerCase();
    const segments = normalized.split("/");
    const name = fileName(normalized);

    return segments.some((segment) => ["__tests__", "spec", "test", "tests"].includes(segment)) ||
      /\.(spec|test)\.[cm]?[jt]sx?$/.test(name) ||
      /\.(spec|test)\.py$/.test(name);
  });
}

function hasDeploymentConfig(paths: string[]) {
  return paths.some((path) => {
    const normalized = path.toLowerCase();
    const name = fileName(normalized);

    return name === "vercel.json" ||
      name === "netlify.toml" ||
      name === "render.yaml" ||
      name === "railway.json" ||
      name === "fly.toml" ||
      name === "dockerfile" ||
      name === "docker-compose.yml" ||
      name === "docker-compose.yaml" ||
      normalized.startsWith(".github/workflows/");
  });
}

function hasArchitectureDiagram(paths: string[]) {
  return paths.some((path) => {
    const normalized = path.toLowerCase();
    const name = fileName(normalized);

    return /architecture|system-design|diagram/.test(normalized) &&
      /\.(md|mdx|png|jpe?g|svg|drawio|mmd|mermaid)$/.test(name);
  });
}

function portfolioEvidencePaths(paths: string[]) {
  return paths.filter((path) => {
    const normalized = path.toLowerCase();
    const name = fileName(normalized);

    return /^readme(\.|$)/i.test(name) ||
      normalized.split("/").some((segment) => ["__tests__", "spec", "test", "tests"].includes(segment)) ||
      /\.(spec|test)\.[cm]?[jt]sx?$/.test(name) ||
      /\.(spec|test)\.py$/.test(name) ||
      ["vercel.json", "netlify.toml", "render.yaml", "railway.json", "fly.toml", "dockerfile"].includes(name) ||
      /architecture|system-design|diagram/.test(normalized) ||
      ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "cargo.toml"].includes(name);
  }).slice(0, 40);
}

function techStackFromPaths(paths: string[]) {
  const stack: string[] = [];
  const hasPath = (predicate: (path: string) => boolean) => paths.some((path) => predicate(path.toLowerCase()));

  if (hasPath((path) => fileName(path) === "package.json")) stack.push("Node.js");
  if (hasPath((path) => fileName(path) === "tsconfig.json" || path.endsWith(".ts") || path.endsWith(".tsx"))) stack.push("TypeScript");
  if (hasPath((path) => path.includes("next.config."))) stack.push("Next.js");
  if (hasPath((path) => path.includes("vite.config."))) stack.push("Vite");
  if (hasPath((path) => fileName(path) === "pyproject.toml" || fileName(path) === "requirements.txt")) stack.push("Python");
  if (hasPath((path) => fileName(path) === "go.mod")) stack.push("Go");
  if (hasPath((path) => fileName(path) === "cargo.toml")) stack.push("Rust");
  if (hasPath((path) => fileName(path) === "dockerfile" || path.endsWith("docker-compose.yml"))) stack.push("Docker");
  if (hasPath((path) => fileName(path) === "vercel.json")) stack.push("Vercel");

  return stack;
}

function normalizedTechStack(values: Array<string | null | undefined>) {
  return uniqueSorted(
    values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()),
  );
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter((value) => value.length > 0))].sort((first, second) =>
    first.localeCompare(second),
  );
}

function fileName(path: string) {
  return path.split("/").at(-1) ?? path;
}

function scanErrorMessage(error: unknown) {
  const status = githubStatus(error);

  if (status === 403) {
    return "GitHub contents access was forbidden or rate limited.";
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "GitHub repository profile scan failed.";
}
