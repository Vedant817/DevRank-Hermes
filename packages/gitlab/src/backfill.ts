import type { GitlabClient } from "./client.js";
import type {
  GitlabBackfillOptions,
  GitlabBackfillResult,
  GitlabCommit,
  GitlabMergeRequest,
  GitlabProject,
} from "./types.js";

export const DEFAULT_GITLAB_PROJECT_LIMIT = 20;
export const MAX_GITLAB_PROJECT_LIMIT = 20;
export const MAX_GITLAB_PAGES = 10;
export const MAX_GITLAB_PER_PAGE = 100;
export const MAX_GITLAB_COMMITS_PER_PROJECT = 100;
export const MAX_GITLAB_MERGE_REQUESTS_PER_PROJECT = 100;
export const MAX_GITLAB_USERNAME_LENGTH = 255;

type ParsedProject = { fork: boolean; project: GitlabProject };

export async function backfillGitlabUser(
  client: GitlabClient,
  username: string,
  options: GitlabBackfillOptions = {},
): Promise<GitlabBackfillResult> {
  const normalizedUsername = normalizeUsername(username);
  const projectLimit = boundedPositiveInteger(
    options.projectLimit,
    DEFAULT_GITLAB_PROJECT_LIMIT,
    MAX_GITLAB_PROJECT_LIMIT,
  );
  const maxPages = boundedPositiveInteger(options.maxPages, MAX_GITLAB_PAGES, MAX_GITLAB_PAGES);
  const perPage = boundedPositiveInteger(options.perPage, MAX_GITLAB_PER_PAGE, MAX_GITLAB_PER_PAGE);
  const commitLimit = boundedPositiveInteger(
    options.commitLimitPerProject,
    MAX_GITLAB_COMMITS_PER_PROJECT,
    MAX_GITLAB_COMMITS_PER_PROJECT,
  );
  const mergeRequestLimit = boundedPositiveInteger(
    options.mergeRequestLimitPerProject,
    MAX_GITLAB_MERGE_REQUESTS_PER_PROJECT,
    MAX_GITLAB_MERGE_REQUESTS_PER_PROJECT,
  );
  const projects = await listProjects(
    client,
    normalizedUsername,
    projectLimit,
    perPage,
    maxPages,
  );
  const commits: GitlabCommit[] = [];
  const mergeRequests: GitlabMergeRequest[] = [];

  for (const project of projects) {
    if (project.emptyRepo || !project.defaultBranch) {
      continue;
    }

    commits.push(...await listCommits(
      client,
      project,
      normalizedUsername,
      commitLimit,
      perPage,
      maxPages,
    ));
    mergeRequests.push(...await listMergeRequests(
      client,
      project,
      normalizedUsername,
      mergeRequestLimit,
      perPage,
      maxPages,
    ));
  }

  return { commits, mergeRequests, projects };
}

async function listProjects(
  client: GitlabClient,
  username: string,
  limit: number,
  perPage: number,
  maxPages: number,
) {
  const projects: GitlabProject[] = [];
  let page = 1;

  while (projects.length < limit) {
    const response = await client.getPage(`/users/${encodeURIComponent(username)}/projects`, {
      order_by: "last_activity_at",
      owned: true,
      page,
      per_page: perPage,
      simple: true,
      sort: "desc",
    });
    const parsed = response.items.slice(0, perPage).map(parseProject);

    projects.push(...parsed.filter((project) => !project.fork).map((project) => project.project));

    const nextPage = checkedNextPage(response.nextPage, page, maxPages);

    if (projects.length >= limit || nextPage === null) {
      break;
    }

    page = nextPage;
  }

  return projects.slice(0, limit);
}

async function listCommits(
  client: GitlabClient,
  project: GitlabProject,
  username: string,
  limit: number,
  perPage: number,
  maxPages: number,
) {
  return listProjectCollection(
    client,
    `/projects/${encodeURIComponent(String(project.id))}/repository/commits`,
    {
      author: username,
      ref_name: project.defaultBranch as string,
    },
    limit,
    perPage,
    maxPages,
    (value) => parseCommit(value, project),
  );
}

async function listMergeRequests(
  client: GitlabClient,
  project: GitlabProject,
  username: string,
  limit: number,
  perPage: number,
  maxPages: number,
) {
  return listProjectCollection(
    client,
    `/projects/${encodeURIComponent(String(project.id))}/merge_requests`,
    {
      author_username: username,
      scope: "all",
      state: "all",
    },
    limit,
    perPage,
    maxPages,
    (value) => parseMergeRequest(value, project),
  );
}

async function listProjectCollection<T>(
  client: GitlabClient,
  path: string,
  query: Record<string, string>,
  limit: number,
  perPage: number,
  maxPages: number,
  parse: (value: unknown) => T,
) {
  const values: T[] = [];
  let page = 1;

  while (values.length < limit) {
    const response = await client.getPage(path, {
      ...query,
      page,
      per_page: Math.min(perPage, limit - values.length),
    });

    values.push(...response.items.slice(0, Math.min(perPage, limit - values.length)).map(parse));

    const nextPage = checkedNextPage(response.nextPage, page, maxPages);

    if (values.length >= limit || nextPage === null) {
      break;
    }

    page = nextPage;
  }

  return values.slice(0, limit);
}

function parseProject(value: unknown): ParsedProject {
  const project = objectRecord(value, "project");

  return {
    fork: project.forked_from_project !== null && project.forked_from_project !== undefined,
    project: {
      archived: optionalBoolean(project.archived, "project.archived") ?? false,
      defaultBranch: optionalString(project.default_branch, "project.default_branch"),
      emptyRepo: optionalBoolean(project.empty_repo, "project.empty_repo") ?? false,
      id: positiveInteger(project.id, "project.id"),
      lastActivityAt: optionalString(project.last_activity_at, "project.last_activity_at"),
      name: requiredString(project.name, "project.name"),
      pathWithNamespace: requiredString(project.path_with_namespace, "project.path_with_namespace"),
      visibility: requiredString(project.visibility, "project.visibility"),
      webUrl: optionalString(project.web_url, "project.web_url"),
    },
  };
}

function parseCommit(value: unknown, project: GitlabProject): GitlabCommit {
  const commit = objectRecord(value, "commit");

  return {
    authorName: optionalString(commit.author_name, "commit.author_name"),
    authoredAt: optionalString(commit.authored_date, "commit.authored_date"),
    committedAt: optionalString(commit.committed_date, "commit.committed_date"),
    message: requiredString(commit.message, "commit.message"),
    projectId: project.id,
    projectPath: project.pathWithNamespace,
    sha: requiredString(commit.id, "commit.id"),
    title: requiredString(commit.title, "commit.title"),
    webUrl: optionalString(commit.web_url, "commit.web_url"),
  };
}

function parseMergeRequest(value: unknown, project: GitlabProject): GitlabMergeRequest {
  const mergeRequest = objectRecord(value, "merge request");
  const author = mergeRequest.author === null || mergeRequest.author === undefined
    ? undefined
    : objectRecord(mergeRequest.author, "merge request.author");

  return {
    authorUsername: optionalString(author?.username, "merge request.author.username"),
    createdAt: optionalString(mergeRequest.created_at, "merge request.created_at"),
    id: positiveInteger(mergeRequest.id, "merge request.id"),
    iid: positiveInteger(mergeRequest.iid, "merge request.iid"),
    mergedAt: optionalString(mergeRequest.merged_at, "merge request.merged_at"),
    projectId: project.id,
    projectPath: project.pathWithNamespace,
    sourceBranch: requiredString(mergeRequest.source_branch, "merge request.source_branch"),
    state: requiredString(mergeRequest.state, "merge request.state"),
    targetBranch: requiredString(mergeRequest.target_branch, "merge request.target_branch"),
    title: requiredString(mergeRequest.title, "merge request.title"),
    updatedAt: optionalString(mergeRequest.updated_at, "merge request.updated_at"),
    webUrl: optionalString(mergeRequest.web_url, "merge request.web_url"),
  };
}

function checkedNextPage(nextPage: number | null, currentPage: number, maxPages: number) {
  if (nextPage === null) {
    return null;
  }

  if (nextPage <= currentPage) {
    throw new Error("GitLab pagination did not advance.");
  }

  if (nextPage > maxPages) {
    throw new Error(`GitLab pagination continuation exceeds the ${maxPages}-page cap.`);
  }

  return nextPage;
}

function normalizeUsername(value: string) {
  const username = value.trim();

  if (username.length === 0) {
    throw new Error("GitLab username must not be empty.");
  }

  if (username.length > MAX_GITLAB_USERNAME_LENGTH) {
    throw new Error(`GitLab username must not exceed ${MAX_GITLAB_USERNAME_LENGTH} characters.`);
  }

  return username;
}

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(value ?? fallback), maximum));
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`GitLab API returned an invalid ${label}.`);
  }

  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`GitLab API returned an invalid ${field} field.`);
  }

  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`GitLab API returned an invalid ${field} field.`);
  }

  return value.trim().length > 0 ? value : null;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`GitLab API returned an invalid ${field} field.`);
  }

  return value;
}

function positiveInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`GitLab API returned an invalid ${field} field.`);
  }

  return value;
}
