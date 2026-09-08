export interface GitlabProject {
  archived: boolean;
  defaultBranch: string | null;
  emptyRepo: boolean;
  id: number;
  lastActivityAt: string | null;
  name: string;
  pathWithNamespace: string;
  visibility: string;
  webUrl: string | null;
}

export interface GitlabCommit {
  authorName: string | null;
  authoredAt: string | null;
  committedAt: string | null;
  message: string;
  projectId: number;
  projectPath: string;
  sha: string;
  title: string;
  webUrl: string | null;
}

export interface GitlabMergeRequest {
  authorUsername: string | null;
  createdAt: string | null;
  id: number;
  iid: number;
  mergedAt: string | null;
  projectId: number;
  projectPath: string;
  sourceBranch: string;
  state: string;
  targetBranch: string;
  title: string;
  updatedAt: string | null;
  webUrl: string | null;
}

export interface GitlabBackfillResult {
  commits: GitlabCommit[];
  mergeRequests: GitlabMergeRequest[];
  projects: GitlabProject[];
}

export interface GitlabBackfillOptions {
  commitLimitPerProject?: number;
  maxPages?: number;
  mergeRequestLimitPerProject?: number;
  perPage?: number;
  projectLimit?: number;
}

export interface GitlabClientOptions {
  fetch?: typeof fetch;
}
