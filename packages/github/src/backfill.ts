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
const MAX_GITHUB_COMMIT_LIMIT_PER_REPO = 100;
const MAX_GITHUB_PR_METADATA_LIMIT_PER_REPO = 100;
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
  const prMetadataLimit = normalizedPrMetadataLimit(options.prMetadataLimitPerRepo);
  const shouldScanPrMetadata = options.prMetadataScan ?? true;
  const shouldScanProfiles = options.profileScan ?? true;
  const repos = await octokit.paginate(octokit.repos.listForUser, {
    username,
    per_page: 100,
    sort: "updated",
  });

  const repoSummaries = repos.map(mapRepo);
  const commits: GithubCommitSummary[] = [];
  const pullRequestFiles: GithubPullRequestFileSummary[] = [];
  const pullRequestReviews: GithubPullRequestReviewSummary[] = [];
  const repoProfiles: GithubRepoProfileSummary[] = [];
  const pullRequests: GithubPullRequestSummary[] = [];

  for (const repo of repoSummaries) {
    const pulls = await octokit.paginate(octokit.pulls.list, {
      owner: repo.owner,
      repo: repo.name,
      state: "all",
      per_page: 100,
    });

    const repoPullRequests = pulls.map((pull) => ({
        id: pull.id,
        repoFullName: repo.fullName,
        number: pull.number,
        title: pull.title,
        state: pull.state,
        htmlUrl: pull.html_url,
        mergedAt: pull.merged_at,
        updatedAt: pull.updated_at,
    }));

    pullRequests.push(...repoPullRequests);

    if (commitLimit > 0) {
      const repoCommits = await listRecentRepoCommits(octokit, repo, commitLimit);
      commits.push(...repoCommits);
    }

    if (shouldScanPrMetadata && prMetadataLimit > 0) {
      for (const pullRequest of recentPullRequests(repoPullRequests, prMetadataLimit)) {
        const metadata = await listPullRequestMetadata(octokit, repo, pullRequest);
        pullRequestFiles.push(...metadata.files);
        pullRequestReviews.push(...metadata.reviews);
      }
    }

    if (shouldScanProfiles) {
      repoProfiles.push(await profileGithubRepo(octokit, repo));
    }
  }

  return {
    commits,
    pullRequestFiles,
    pullRequestReviews,
    repoProfiles,
    repos: repoSummaries,
    pullRequests,
  };
}

async function listPullRequestMetadata(
  octokit: Octokit,
  repo: GithubRepoSummary,
  pullRequest: GithubPullRequestSummary,
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

    if (status === 404 || status === 410) {
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
