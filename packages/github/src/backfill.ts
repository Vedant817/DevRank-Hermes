import type { Octokit } from "@octokit/rest";
import type {
  GithubBackfillResult,
  GithubPullRequestSummary,
  GithubRepoSummary,
} from "./types.js";

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

export async function backfillGithubUser(
  octokit: Octokit,
  username: string,
): Promise<GithubBackfillResult> {
  const repos = await octokit.paginate(octokit.repos.listForUser, {
    username,
    per_page: 100,
    sort: "updated",
  });

  const repoSummaries = repos.map(mapRepo);
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
  }

  return {
    repos: repoSummaries,
    pullRequests,
  };
}
