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
  commits: GithubCommitSummary[];
  pullRequestFiles: GithubPullRequestFileSummary[];
  pullRequestReviews: GithubPullRequestReviewSummary[];
  repoProfiles: GithubRepoProfileSummary[];
  repos: GithubRepoSummary[];
  pullRequests: GithubPullRequestSummary[];
}

export interface GithubBackfillOptions {
  commitLimitPerRepo?: number;
  prMetadataLimitPerRepo?: number;
  prMetadataScan?: boolean;
  profileScan?: boolean;
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
