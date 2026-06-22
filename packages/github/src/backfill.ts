import type { Octokit } from "@octokit/rest";
import type {
  GithubBackfillOptions,
  GithubBackfillResult,
  GithubCommitSummary,
  GithubPullRequestSummary,
  GithubRepoSummary,
} from "./types.js";

export const DEFAULT_GITHUB_COMMIT_LIMIT_PER_REPO = 100;
const MAX_GITHUB_COMMIT_LIMIT_PER_REPO = 100;

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
  const repos = await octokit.paginate(octokit.repos.listForUser, {
    username,
    per_page: 100,
    sort: "updated",
  });

  const repoSummaries = repos.map(mapRepo);
  const commits: GithubCommitSummary[] = [];
  const pullRequests: GithubPullRequestSummary[] = [];

  for (const repo of repoSummaries) {
    const pulls = await octokit.paginate(octokit.pulls.list, {
      owner: repo.owner,
      repo: repo.name,
      state: "all",
      per_page: 100,
    });

    pullRequests.push(
      ...pulls.map((pull) => ({
        id: pull.id,
        repoFullName: repo.fullName,
        number: pull.number,
        title: pull.title,
        state: pull.state,
        htmlUrl: pull.html_url,
        mergedAt: pull.merged_at,
        updatedAt: pull.updated_at,
      })),
    );

    if (commitLimit > 0) {
      const repoCommits = await listRecentRepoCommits(octokit, repo, commitLimit);
      commits.push(...repoCommits);
    }
  }

  return {
    commits,
    repos: repoSummaries,
    pullRequests,
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

function githubStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
}
