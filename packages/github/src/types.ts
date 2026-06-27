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
  headSha?: string | null;
  htmlUrl: string | null;
  mergedAt: string | null;
  updatedAt: string | null;
}

export type GithubPullRequestCheckStatus =
  | "completed"
  | "in_progress"
  | "pending"
  | "queued"
  | "requested"
  | "waiting";

export type GithubPullRequestCheckConclusion =
  | "action_required"
  | "cancelled"
  | "failure"
  | "neutral"
  | "skipped"
  | "stale"
  | "success"
  | "timed_out";

export interface GithubPullRequestCheckSummary {
  appSlug: string | null;
  completedAt: string | null;
  conclusion: GithubPullRequestCheckConclusion | null;
  detailsUrl: string | null;
  headSha: string;
  id: number;
  name: string;
  pullRequestId: number;
  pullRequestNumber: number;
  repoFullName: string;
  startedAt: string | null;
  status: GithubPullRequestCheckStatus;
}

export interface GithubPullRequestCheckSnapshot {
  headSha: string;
  pullRequestId: number;
  pullRequestNumber: number;
  repoFullName: string;
}

export interface GithubPullRequestFileSummary {
  additions: number;
  changes: number;
  deletions: number;
  filename: string;
  previousFilename: string | null;
  pullRequestId: number;
  pullRequestNumber: number;
  repoFullName: string;
  status: string;
}

export interface GithubPullRequestReviewSummary {
  commentCount: number;
  htmlUrl: string | null;
  id: number;
  pullRequestId: number;
  pullRequestNumber: number;
  repoFullName: string;
  reviewerLogin: string | null;
  state: string;
  submittedAt: string | null;
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

export interface GithubRepoProfileSummary {
  evidencePaths: string[];
  hasArchitectureDiagram: boolean | null;
  hasDeploymentConfig: boolean | null;
  hasReadme: boolean | null;
  hasTests: boolean | null;
  repoFullName: string;
  scanError: string | null;
  scannedAt: string;
  scanStatus: "scanned" | "unavailable";
  techStack: string[];
}

export interface GithubBackfillResult {
  checkpoint?: {
    complete: boolean;
    nextRepoPage: number | null;
    repoLimit: number;
    repoPage: number;
  };
  commits: GithubCommitSummary[];
  pullRequestChecks?: GithubPullRequestCheckSummary[];
  pullRequestCheckSnapshots?: GithubPullRequestCheckSnapshot[];
  pullRequestFiles: GithubPullRequestFileSummary[];
  pullRequestReviews: GithubPullRequestReviewSummary[];
  repoProfiles: GithubRepoProfileSummary[];
  repos: GithubRepoSummary[];
  pullRequests: GithubPullRequestSummary[];
}

export interface GithubBackfillOptions {
  commitLimitPerRepo?: number;
  concurrency?: number;
  minimumRateLimitRemaining?: number;
  prMetadataLimitPerRepo?: number;
  prMetadataScan?: boolean;
  profileScan?: boolean;
  pullRequestLimitPerRepo?: number;
  repoLimit?: number;
  repoPage?: number;
}

export interface GithubWebhookResult {
  eventName: string;
  deliveryId: string;
  action?: string;
  repository?: string;
  pullRequestNumber?: number;
  pullRequestNumbers?: number[];
}

export interface GithubWebhookIngestion {
  backfill: GithubBackfillResult;
  deletions: {
    repositoryIds: number[];
  };
  summary: GithubWebhookResult;
}
