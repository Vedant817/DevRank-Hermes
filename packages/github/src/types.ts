export interface GithubRepoSummary {
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

export interface GithubPullRequestSummary {
  id: number;
  repoFullName: string;
  number: number;
  title: string;
  state: string;
  htmlUrl: string | null;
  mergedAt: string | null;
  updatedAt: string | null;
}

export interface GithubCommitSummary {
  authorLogin: string | null;
  branch: string | null;
  committedAt: string | null;
  htmlUrl: string | null;
  message: string;
  repoFullName: string;
  sha: string;
}

export interface GithubBackfillResult {
  commits: GithubCommitSummary[];
  repos: GithubRepoSummary[];
  pullRequests: GithubPullRequestSummary[];
}

export interface GithubBackfillOptions {
  commitLimitPerRepo?: number;
}

export interface GithubWebhookResult {
  eventName: string;
  deliveryId: string;
  action?: string;
  repository?: string;
  pullRequestNumber?: number;
}

export interface GithubWebhookIngestion {
  backfill: GithubBackfillResult;
  summary: GithubWebhookResult;
}
