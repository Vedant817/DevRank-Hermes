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

export interface GithubBackfillResult {
  repos: GithubRepoSummary[];
  pullRequests: GithubPullRequestSummary[];
}

export interface GithubWebhookResult {
  eventName: string;
  deliveryId: string;
  action?: string;
  repository?: string;
  pullRequestNumber?: number;
}
