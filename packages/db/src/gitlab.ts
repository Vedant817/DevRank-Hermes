import { resolveSingleUserOwner, type EvidenceItem } from "@repo/shared";
import type { SqlClient } from "./client.js";

export interface PersistableGitlabProject {
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

export interface PersistableGitlabCommit {
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

export interface PersistableGitlabMergeRequest {
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

export interface PersistableGitlabBackfill {
  commits: PersistableGitlabCommit[];
  mergeRequests: PersistableGitlabMergeRequest[];
  projects: PersistableGitlabProject[];
}

type GitlabProjectEvidenceRow = {
  id: string | number;
  last_activity_at: Date | string | null;
  path_with_namespace: string;
  synced_at: Date | string;
  visibility: string;
  web_url: string | null;
};

type GitlabCommitEvidenceRow = {
  author_name: string | null;
  committed_at: Date | string | null;
  message: string;
  path_with_namespace: string;
  sha: string;
  synced_at: Date | string;
  title: string;
  web_url: string | null;
};

type GitlabMergeRequestEvidenceRow = {
  author_username: string | null;
  iid: number;
  merged_at: Date | string | null;
  path_with_namespace: string;
  state: string;
  synced_at: Date | string;
  title: string;
  updated_at: Date | string | null;
  web_url: string | null;
};

export async function upsertGitlabBackfill(
  sql: SqlClient,
  input: PersistableGitlabBackfill,
): Promise<{ commits: number; mergeRequests: number; projects: number }> {
  const ownerId = resolveSingleUserOwner().id;
  let projects = 0;
  let commits = 0;
  let mergeRequests = 0;

  for (const project of input.projects) {
    await sql`
      insert into gitlab_projects (
        id,
        owner_id,
        name,
        path_with_namespace,
        visibility,
        default_branch,
        web_url,
        archived,
        empty_repo,
        last_activity_at,
        synced_at
      )
      values (
        ${project.id},
        ${ownerId},
        ${project.name},
        ${project.pathWithNamespace},
        ${project.visibility},
        ${project.defaultBranch},
        ${project.webUrl},
        ${project.archived},
        ${project.emptyRepo},
        ${project.lastActivityAt},
        now()
      )
      on conflict (id) do update set
        owner_id = excluded.owner_id,
        name = excluded.name,
        path_with_namespace = excluded.path_with_namespace,
        visibility = excluded.visibility,
        default_branch = excluded.default_branch,
        web_url = excluded.web_url,
        archived = excluded.archived,
        empty_repo = excluded.empty_repo,
        last_activity_at = excluded.last_activity_at,
        synced_at = now()
    `;
    projects += 1;
  }

  for (const commit of input.commits) {
    await sql`
      insert into gitlab_commits (
        project_id,
        sha,
        title,
        message,
        author_name,
        authored_at,
        committed_at,
        web_url,
        synced_at
      )
      values (
        ${commit.projectId},
        ${commit.sha},
        ${commit.title},
        ${commit.message},
        ${commit.authorName},
        ${commit.authoredAt},
        ${commit.committedAt},
        ${commit.webUrl},
        now()
      )
      on conflict (project_id, sha) do update set
        title = excluded.title,
        message = excluded.message,
        author_name = excluded.author_name,
        authored_at = excluded.authored_at,
        committed_at = excluded.committed_at,
        web_url = excluded.web_url,
        synced_at = now()
    `;
    commits += 1;
  }

  for (const mergeRequest of input.mergeRequests) {
    await sql`
      insert into gitlab_merge_requests (
        id,
        project_id,
        iid,
        title,
        state,
        source_branch,
        target_branch,
        author_username,
        web_url,
        created_at,
        updated_at,
        merged_at,
        synced_at
      )
      values (
        ${mergeRequest.id},
        ${mergeRequest.projectId},
        ${mergeRequest.iid},
        ${mergeRequest.title},
        ${mergeRequest.state},
        ${mergeRequest.sourceBranch},
        ${mergeRequest.targetBranch},
        ${mergeRequest.authorUsername},
        ${mergeRequest.webUrl},
        ${mergeRequest.createdAt},
        ${mergeRequest.updatedAt},
        ${mergeRequest.mergedAt},
        now()
      )
      on conflict (id) do update set
        project_id = excluded.project_id,
        iid = excluded.iid,
        title = excluded.title,
        state = excluded.state,
        source_branch = excluded.source_branch,
        target_branch = excluded.target_branch,
        author_username = excluded.author_username,
        web_url = excluded.web_url,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        merged_at = excluded.merged_at,
        synced_at = now()
    `;
    mergeRequests += 1;
  }

  return { commits, mergeRequests, projects };
}

export async function listGitlabProjectEvidence(
  sql: SqlClient,
  projectPath: string | undefined,
  limit: number,
): Promise<EvidenceItem[]> {
  const boundedLimit = evidenceLimit(limit);
  const rows = projectPath
    ? await sql<GitlabProjectEvidenceRow[]>`
        select id, path_with_namespace, visibility, web_url, last_activity_at, synced_at
        from gitlab_projects
        where path_with_namespace = ${projectPath}
        order by coalesce(last_activity_at, synced_at) desc
        limit ${boundedLimit}
      `
    : await sql<GitlabProjectEvidenceRow[]>`
        select id, path_with_namespace, visibility, web_url, last_activity_at, synced_at
        from gitlab_projects
        order by coalesce(last_activity_at, synced_at) desc
        limit ${boundedLimit}
      `;

  return rows.map((row) => ({
    id: `gitlab:project:${row.id}`,
    source: "gitlab",
    title: `Repository: ${row.path_with_namespace}`,
    summary: `Repository ${row.path_with_namespace} is tracked with ${row.visibility} visibility.`,
    occurredAt: toIso(row.last_activity_at ?? row.synced_at),
    ...(row.web_url ? { url: row.web_url } : {}),
    metadata: {
      kind: "gitlab_project",
      repository: row.path_with_namespace,
      visibility: row.visibility,
    },
  }));
}

export async function listGitlabCommitEvidence(
  sql: SqlClient,
  projectPath: string | undefined,
  limit: number,
): Promise<EvidenceItem[]> {
  const boundedLimit = evidenceLimit(limit);
  const rows = projectPath
    ? await sql<GitlabCommitEvidenceRow[]>`
        select
          project.path_with_namespace,
          gitlab_commit.sha,
          gitlab_commit.title,
          gitlab_commit.message,
          gitlab_commit.author_name,
          gitlab_commit.committed_at,
          gitlab_commit.web_url,
          gitlab_commit.synced_at
        from gitlab_commits gitlab_commit
        join gitlab_projects project on project.id = gitlab_commit.project_id
        where project.path_with_namespace = ${projectPath}
        order by coalesce(gitlab_commit.committed_at, gitlab_commit.synced_at) desc
        limit ${boundedLimit}
      `
    : await sql<GitlabCommitEvidenceRow[]>`
        select
          project.path_with_namespace,
          gitlab_commit.sha,
          gitlab_commit.title,
          gitlab_commit.message,
          gitlab_commit.author_name,
          gitlab_commit.committed_at,
          gitlab_commit.web_url,
          gitlab_commit.synced_at
        from gitlab_commits gitlab_commit
        join gitlab_projects project on project.id = gitlab_commit.project_id
        order by coalesce(gitlab_commit.committed_at, gitlab_commit.synced_at) desc
        limit ${boundedLimit}
      `;

  return rows.map((row) => ({
    id: `gitlab:commit:${row.path_with_namespace}:${row.sha}`,
    source: "gitlab",
    title: `Repository change ${row.path_with_namespace}@${row.sha.slice(0, 7)}`,
    summary: row.message.split("\n").find((line) => line.trim().length > 0)?.trim() || row.title,
    occurredAt: toIso(row.committed_at ?? row.synced_at),
    ...(row.web_url ? { url: row.web_url } : {}),
    metadata: {
      authorName: row.author_name,
      commitSha: row.sha,
      kind: "gitlab_commit",
      repository: row.path_with_namespace,
    },
  }));
}

export async function listGitlabMergeRequestEvidence(
  sql: SqlClient,
  projectPath: string | undefined,
  limit: number,
): Promise<EvidenceItem[]> {
  const boundedLimit = evidenceLimit(limit);
  const rows = projectPath
    ? await sql<GitlabMergeRequestEvidenceRow[]>`
        select
          project.path_with_namespace,
          merge_request.iid,
          merge_request.title,
          merge_request.state,
          merge_request.author_username,
          merge_request.web_url,
          merge_request.updated_at,
          merge_request.merged_at,
          merge_request.synced_at
        from gitlab_merge_requests merge_request
        join gitlab_projects project on project.id = merge_request.project_id
        where project.path_with_namespace = ${projectPath}
        order by coalesce(merge_request.updated_at, merge_request.merged_at, merge_request.synced_at) desc
        limit ${boundedLimit}
      `
    : await sql<GitlabMergeRequestEvidenceRow[]>`
        select
          project.path_with_namespace,
          merge_request.iid,
          merge_request.title,
          merge_request.state,
          merge_request.author_username,
          merge_request.web_url,
          merge_request.updated_at,
          merge_request.merged_at,
          merge_request.synced_at
        from gitlab_merge_requests merge_request
        join gitlab_projects project on project.id = merge_request.project_id
        order by coalesce(merge_request.updated_at, merge_request.merged_at, merge_request.synced_at) desc
        limit ${boundedLimit}
      `;

  return rows.map((row) => ({
    id: `gitlab:merge_request:${row.path_with_namespace}:${row.iid}`,
    source: "gitlab",
    title: `Repository change request ${row.path_with_namespace}!${row.iid}`,
    summary: `${row.title} is ${row.state}.`,
    occurredAt: toIso(row.updated_at ?? row.merged_at ?? row.synced_at),
    ...(row.web_url ? { url: row.web_url } : {}),
    metadata: {
      authorUsername: row.author_username,
      kind: "gitlab_merge_request",
      mergeRequestIid: row.iid,
      repository: row.path_with_namespace,
      state: row.state,
    },
  }));
}

function evidenceLimit(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), 5_000)) : 500;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
