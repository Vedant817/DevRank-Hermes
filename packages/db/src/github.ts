import type { EvidenceItem } from "@repo/shared";
import type { SqlClient } from "./client.js";

export interface PersistableGithubRepo {
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

export interface PersistableGithubPullRequest {
  id: number;
  repoFullName: string;
  number: number;
  title: string;
  state: string;
  htmlUrl: string | null;
  mergedAt: string | null;
  updatedAt: string | null;
}

export interface PersistableGithubCommit {
  authorLogin: string | null;
  branch: string | null;
  committedAt: string | null;
  htmlUrl: string | null;
  message: string;
  repoFullName: string;
  sha: string;
}

export interface PersistableGithubBackfill {
  commits?: PersistableGithubCommit[];
  repos: PersistableGithubRepo[];
  pullRequests: PersistableGithubPullRequest[];
}

export type GithubPullRequestTarget = {
  number: number;
  repoFullName?: string;
};

type GithubRepoEvidenceRow = {
  id: string | number;
  full_name: string;
  language: string | null;
  html_url: string | null;
  pushed_at: Date | string | null;
  updated_at: Date | string | null;
};

type GithubPullRequestEvidenceRow = {
  id: string | number;
  repo_full_name: string;
  number: number;
  title: string;
  state: string;
  html_url: string | null;
  merged_at: Date | string | null;
  updated_at: Date | string | null;
};

type GithubCommitEvidenceRow = {
  author_login: string | null;
  branch: string | null;
  committed_at: Date | string | null;
  full_name: string;
  html_url: string | null;
  message: string;
  sha: string;
};

export async function upsertGithubBackfill(
  sql: SqlClient,
  input: PersistableGithubBackfill,
): Promise<{
  commits: number;
  pullRequests: number;
  repos: number;
}> {
  const repoIdsByFullName = new Map<string, number>();
  let commits = 0;
  let repos = 0;
  let pullRequests = 0;

  for (const repo of input.repos) {
    repoIdsByFullName.set(repo.fullName, repo.id);

    await sql`
      insert into github_repos (
        id,
        owner,
        name,
        full_name,
        private,
        default_branch,
        html_url,
        language,
        pushed_at,
        updated_at,
        synced_at
      )
      values (
        ${repo.id},
        ${repo.owner},
        ${repo.name},
        ${repo.fullName},
        ${repo.private},
        ${repo.defaultBranch},
        ${repo.htmlUrl},
        ${repo.language},
        ${repo.pushedAt},
        ${repo.updatedAt},
        now()
      )
      on conflict (id) do update set
        owner = excluded.owner,
        name = excluded.name,
        full_name = excluded.full_name,
        private = excluded.private,
        default_branch = excluded.default_branch,
        html_url = excluded.html_url,
        language = excluded.language,
        pushed_at = excluded.pushed_at,
        updated_at = excluded.updated_at,
        synced_at = now()
    `;
    repos += 1;
  }

  for (const pullRequest of input.pullRequests) {
    const repoId = repoIdsByFullName.get(pullRequest.repoFullName);

    if (repoId === undefined) {
      continue;
    }

    await sql`
      insert into github_pull_requests (
        id,
        repo_id,
        number,
        title,
        state,
        html_url,
        merged_at,
        updated_at,
        synced_at
      )
      values (
        ${pullRequest.id},
        ${repoId},
        ${pullRequest.number},
        ${pullRequest.title},
        ${pullRequest.state},
        ${pullRequest.htmlUrl},
        ${pullRequest.mergedAt},
        ${pullRequest.updatedAt},
        now()
      )
      on conflict (id) do update set
        repo_id = excluded.repo_id,
        number = excluded.number,
        title = excluded.title,
        state = excluded.state,
        html_url = excluded.html_url,
        merged_at = excluded.merged_at,
        updated_at = excluded.updated_at,
        synced_at = now()
    `;
    pullRequests += 1;
  }

  for (const commit of input.commits ?? []) {
    const repoId = repoIdsByFullName.get(commit.repoFullName)
      ?? await getGithubRepoIdByFullName(sql, commit.repoFullName);

    if (repoId === undefined) {
      continue;
    }

    await sql`
      insert into github_commits (
        repo_id,
        sha,
        message,
        author_login,
        html_url,
        committed_at,
        branch,
        synced_at
      )
      values (
        ${repoId},
        ${commit.sha},
        ${commit.message},
        ${commit.authorLogin},
        ${commit.htmlUrl},
        ${commit.committedAt},
        ${commit.branch},
        now()
      )
      on conflict (repo_id, sha) do update set
        message = excluded.message,
        author_login = excluded.author_login,
        html_url = excluded.html_url,
        committed_at = excluded.committed_at,
        branch = excluded.branch,
        synced_at = now()
    `;
    commits += 1;
  }

  return {
    commits,
    pullRequests,
    repos,
  };
}

export async function listGithubRepoEvidence(
  sql: SqlClient,
  repoFullName: string | undefined,
  limit: number,
): Promise<EvidenceItem[]> {
  const rows = repoFullName
    ? await sql<GithubRepoEvidenceRow[]>`
        select id, full_name, language, html_url, pushed_at, updated_at
        from github_repos
        where full_name = ${repoFullName}
        order by coalesce(updated_at, pushed_at, synced_at) desc
        limit ${limit}
      `
    : await sql<GithubRepoEvidenceRow[]>`
        select id, full_name, language, html_url, pushed_at, updated_at
        from github_repos
        order by coalesce(updated_at, pushed_at, synced_at) desc
        limit ${limit}
      `;

  return rows.map((row) => ({
    id: `github:repo:${row.id}`,
    source: "github",
    title: `GitHub repository: ${row.full_name}`,
    summary: [
      `Repository ${row.full_name} is tracked in GitHub backfill.`,
      row.language ? `Primary language: ${row.language}.` : "",
    ].filter(Boolean).join(" "),
    occurredAt: toIso(row.updated_at ?? row.pushed_at ?? new Date().toISOString()),
    ...(row.html_url ? { url: row.html_url } : {}),
    metadata: {
      repository: row.full_name,
      language: row.language,
      kind: "github_repo",
    },
  }));
}

export async function listGithubPullRequestEvidence(
  sql: SqlClient,
  target: Partial<GithubPullRequestTarget>,
  limit: number,
): Promise<EvidenceItem[]> {
  const rows = target.repoFullName && target.number !== undefined
    ? await sql<GithubPullRequestEvidenceRow[]>`
        select
          pr.id,
          repo.full_name as repo_full_name,
          pr.number,
          pr.title,
          pr.state,
          pr.html_url,
          pr.merged_at,
          pr.updated_at
        from github_pull_requests pr
        join github_repos repo on repo.id = pr.repo_id
        where repo.full_name = ${target.repoFullName}
          and pr.number = ${target.number}
        order by coalesce(pr.updated_at, pr.synced_at) desc
        limit ${limit}
      `
    : target.repoFullName
      ? await sql<GithubPullRequestEvidenceRow[]>`
          select
            pr.id,
            repo.full_name as repo_full_name,
            pr.number,
            pr.title,
            pr.state,
            pr.html_url,
            pr.merged_at,
            pr.updated_at
          from github_pull_requests pr
          join github_repos repo on repo.id = pr.repo_id
          where repo.full_name = ${target.repoFullName}
          order by coalesce(pr.updated_at, pr.synced_at) desc
          limit ${limit}
        `
      : target.number !== undefined
        ? await sql<GithubPullRequestEvidenceRow[]>`
            select
              pr.id,
              repo.full_name as repo_full_name,
              pr.number,
              pr.title,
              pr.state,
              pr.html_url,
              pr.merged_at,
              pr.updated_at
            from github_pull_requests pr
            join github_repos repo on repo.id = pr.repo_id
            where pr.number = ${target.number}
            order by coalesce(pr.updated_at, pr.synced_at) desc
            limit ${limit}
          `
        : await sql<GithubPullRequestEvidenceRow[]>`
            select
              pr.id,
              repo.full_name as repo_full_name,
              pr.number,
              pr.title,
              pr.state,
              pr.html_url,
              pr.merged_at,
              pr.updated_at
            from github_pull_requests pr
            join github_repos repo on repo.id = pr.repo_id
            order by coalesce(pr.updated_at, pr.synced_at) desc
            limit ${limit}
          `;

  return rows.map((row) => ({
    id: `github:pull_request:${row.id}`,
    source: "github",
    title: `GitHub PR ${row.repo_full_name}#${row.number}: ${row.title}`,
    summary: [
      `Pull request ${row.repo_full_name}#${row.number} is ${row.state}.`,
      row.merged_at ? "It has been merged." : "",
    ].filter(Boolean).join(" "),
    occurredAt: toIso(row.updated_at ?? row.merged_at ?? new Date().toISOString()),
    ...(row.html_url ? { url: row.html_url } : {}),
    metadata: {
      repository: row.repo_full_name,
      pullRequestNumber: row.number,
      state: row.state,
      kind: "github_pull_request",
    },
  }));
}

export async function listGithubCommitEvidence(
  sql: SqlClient,
  repoFullName: string | undefined,
  limit: number,
): Promise<EvidenceItem[]> {
  const rows = repoFullName
    ? await sql<GithubCommitEvidenceRow[]>`
        select
          repo.full_name,
          commit.sha,
          commit.message,
          commit.author_login,
          commit.html_url,
          commit.committed_at,
          commit.branch
        from github_commits commit
        join github_repos repo on repo.id = commit.repo_id
        where repo.full_name = ${repoFullName}
        order by coalesce(commit.committed_at, commit.synced_at) desc
        limit ${limit}
      `
    : await sql<GithubCommitEvidenceRow[]>`
        select
          repo.full_name,
          commit.sha,
          commit.message,
          commit.author_login,
          commit.html_url,
          commit.committed_at,
          commit.branch
        from github_commits commit
        join github_repos repo on repo.id = commit.repo_id
        order by coalesce(commit.committed_at, commit.synced_at) desc
        limit ${limit}
      `;

  return rows.map((row) => {
    const firstLine = row.message.split("\n").find((line) => line.trim().length > 0)?.trim()
      ?? "Commit message unavailable";

    return {
      id: `github:commit:${row.full_name}:${row.sha}`,
      source: "github",
      title: `GitHub commit ${row.full_name}@${row.sha.slice(0, 7)}`,
      summary: [
        firstLine,
        row.branch ? `Branch: ${row.branch}.` : "",
        row.author_login ? `Author: ${row.author_login}.` : "",
      ].filter(Boolean).join(" "),
      occurredAt: toIso(row.committed_at ?? new Date().toISOString()),
      ...(row.html_url ? { url: row.html_url } : {}),
      metadata: {
        repository: row.full_name,
        branch: row.branch,
        commitSha: row.sha,
        kind: "github_commit",
      },
    };
  });
}

async function getGithubRepoIdByFullName(
  sql: SqlClient,
  fullName: string,
): Promise<number | undefined> {
  const rows = await sql<Array<{ id: string | number }>>`
    select id
    from github_repos
    where full_name = ${fullName}
    limit 1
  `;
  const id = rows[0]?.id;

  return id === undefined ? undefined : Number(id);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
