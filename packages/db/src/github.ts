import { resolveSingleUserOwner } from "@repo/shared";
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
  headSha?: string | null;
  htmlUrl: string | null;
  mergedAt: string | null;
  updatedAt: string | null;
}

export interface PersistableGithubPullRequestFile {
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

export interface PersistableGithubPullRequestReview {
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

export interface PersistableGithubPullRequestCheck {
  appSlug: string | null;
  completedAt: string | null;
  conclusion: string | null;
  detailsUrl: string | null;
  headSha: string;
  id: number;
  name: string;
  pullRequestId: number;
  pullRequestNumber: number;
  repoFullName: string;
  startedAt: string | null;
  status: string;
}

export interface PersistableGithubPullRequestCheckSnapshot {
  headSha: string;
  pullRequestId: number;
  pullRequestNumber: number;
  repoFullName: string;
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

export interface PersistableGithubRepoProfile {
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

export interface PersistableGithubIssue {
  authorLogin: string | null;
  closedAt: string | null;
  htmlUrl: string | null;
  id: number;
  number: number;
  openedAt: string | null;
  repoFullName: string;
  state: string;
  title: string;
  updatedAt: string | null;
}

export interface PersistableGithubWorkflowRun {
  conclusion: string | null;
  event: string | null;
  headBranch: string | null;
  headSha: string | null;
  htmlUrl: string | null;
  id: number;
  name: string | null;
  repoFullName: string;
  runStartedAt: string | null;
  status: string | null;
  updatedAt: string | null;
}

export interface PersistableGithubBackfill {
  commits?: PersistableGithubCommit[];
  issues?: PersistableGithubIssue[];
  pullRequestChecks?: PersistableGithubPullRequestCheck[];
  pullRequestCheckSnapshots?: PersistableGithubPullRequestCheckSnapshot[];
  pullRequestFiles?: PersistableGithubPullRequestFile[];
  pullRequestReviews?: PersistableGithubPullRequestReview[];
  releases?: PersistableGithubRelease[];
  repoProfiles?: PersistableGithubRepoProfile[];
  repos: PersistableGithubRepo[];
  pullRequests: PersistableGithubPullRequest[];
  workflowRuns?: PersistableGithubWorkflowRun[];
}

export interface PersistableGithubRelease {
  htmlUrl: string | null;
  id: number;
  name: string | null;
  publishedAt: string | null;
  repoFullName: string;
  tagName: string | null;
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
  issues: number;
  pullRequestChecks: number;
  pullRequestFiles: number;
  pullRequestReviews: number;
  releases: number;
  repoProfiles: number;
  pullRequests: number;
  repos: number;
  workflowRuns: number;
}> {
  const repoIdsByFullName = new Map<string, number>();
  let commits = 0;
  let issues = 0;
  let pullRequestChecks = 0;
  let pullRequestFiles = 0;
  let pullRequestReviews = 0;
  let releases = 0;
  let repoProfiles = 0;
  let repos = 0;
  let pullRequests = 0;
  let workflowRuns = 0;
  let ownerId: string | undefined;

  try {
    ownerId = resolveSingleUserOwner().id;
  } catch {
    // single-user owner not configured
  }

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
        synced_at,
        owner_id
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
        now(),
        ${ownerId ?? null}
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
        head_sha,
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
        ${pullRequest.headSha ?? null},
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
        head_sha = excluded.head_sha,
        html_url = excluded.html_url,
        merged_at = excluded.merged_at,
        updated_at = excluded.updated_at,
        synced_at = now()
    `;
    pullRequests += 1;
  }

  for (const snapshot of input.pullRequestCheckSnapshots ?? []) {
    if (!await githubPullRequestExists(sql, snapshot.pullRequestId)) {
      continue;
    }

    await sql`
      delete from github_pr_checks
      where pull_request_id = ${snapshot.pullRequestId}
    `;
  }

  for (const file of input.pullRequestFiles ?? []) {
    if (!await githubPullRequestExists(sql, file.pullRequestId)) {
      continue;
    }

    await sql`
      insert into github_pr_files (
        pull_request_id,
        filename,
        status,
        additions,
        deletions,
        changes,
        previous_filename,
        synced_at
      )
      values (
        ${file.pullRequestId},
        ${file.filename},
        ${file.status},
        ${file.additions},
        ${file.deletions},
        ${file.changes},
        ${file.previousFilename},
        now()
      )
      on conflict (pull_request_id, filename) do update set
        status = excluded.status,
        additions = excluded.additions,
        deletions = excluded.deletions,
        changes = excluded.changes,
        previous_filename = excluded.previous_filename,
        synced_at = now()
    `;
    pullRequestFiles += 1;
  }

  for (const review of input.pullRequestReviews ?? []) {
    if (!await githubPullRequestExists(sql, review.pullRequestId)) {
      continue;
    }

    await sql`
      insert into github_pr_reviews (
        id,
        pull_request_id,
        reviewer_login,
        state,
        html_url,
        submitted_at,
        comment_count,
        synced_at
      )
      values (
        ${review.id},
        ${review.pullRequestId},
        ${review.reviewerLogin},
        ${review.state},
        ${review.htmlUrl},
        ${review.submittedAt},
        ${review.commentCount},
        now()
      )
      on conflict (id) do update set
        pull_request_id = excluded.pull_request_id,
        reviewer_login = excluded.reviewer_login,
        state = excluded.state,
        html_url = excluded.html_url,
        submitted_at = excluded.submitted_at,
        comment_count = excluded.comment_count,
        synced_at = now()
    `;
    pullRequestReviews += 1;
  }

  for (const check of input.pullRequestChecks ?? []) {
    if (!await githubPullRequestExists(sql, check.pullRequestId)) {
      continue;
    }

    await sql`
      insert into github_pr_checks (
        id,
        pull_request_id,
        head_sha,
        name,
        status,
        conclusion,
        details_url,
        app_slug,
        started_at,
        completed_at,
        synced_at
      )
      values (
        ${check.id},
        ${check.pullRequestId},
        ${check.headSha},
        ${check.name},
        ${check.status},
        ${check.conclusion},
        ${check.detailsUrl},
        ${check.appSlug},
        ${check.startedAt},
        ${check.completedAt},
        now()
      )
      on conflict (id) do update set
        pull_request_id = excluded.pull_request_id,
        head_sha = excluded.head_sha,
        name = excluded.name,
        status = excluded.status,
        conclusion = excluded.conclusion,
        details_url = excluded.details_url,
        app_slug = excluded.app_slug,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        synced_at = now()
    `;
    pullRequestChecks += 1;
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

  for (const issue of input.issues ?? []) {
    const repoId = repoIdsByFullName.get(issue.repoFullName)
      ?? await getGithubRepoIdByFullName(sql, issue.repoFullName);

    if (repoId === undefined) {
      continue;
    }

    await sql`
      insert into github_issues (
        id,
        repo_id,
        number,
        title,
        state,
        author_login,
        html_url,
        opened_at,
        closed_at,
        updated_at,
        synced_at
      )
      values (
        ${issue.id},
        ${repoId},
        ${issue.number},
        ${issue.title},
        ${issue.state},
        ${issue.authorLogin},
        ${issue.htmlUrl},
        ${issue.openedAt},
        ${issue.closedAt},
        ${issue.updatedAt},
        now()
      )
      on conflict (id) do update set
        repo_id = excluded.repo_id,
        number = excluded.number,
        title = excluded.title,
        state = excluded.state,
        author_login = excluded.author_login,
        html_url = excluded.html_url,
        opened_at = excluded.opened_at,
        closed_at = excluded.closed_at,
        updated_at = excluded.updated_at,
        synced_at = now()
    `;
    issues += 1;
  }

  for (const workflowRun of input.workflowRuns ?? []) {
    const repoId = repoIdsByFullName.get(workflowRun.repoFullName)
      ?? await getGithubRepoIdByFullName(sql, workflowRun.repoFullName);

    if (repoId === undefined) {
      continue;
    }

    await sql`
      insert into github_workflow_runs (
        id,
        repo_id,
        name,
        event,
        status,
        conclusion,
        head_branch,
        head_sha,
        html_url,
        run_started_at,
        updated_at,
        synced_at
      )
      values (
        ${workflowRun.id},
        ${repoId},
        ${workflowRun.name},
        ${workflowRun.event},
        ${workflowRun.status},
        ${workflowRun.conclusion},
        ${workflowRun.headBranch},
        ${workflowRun.headSha},
        ${workflowRun.htmlUrl},
        ${workflowRun.runStartedAt},
        ${workflowRun.updatedAt},
        now()
      )
      on conflict (id) do update set
        repo_id = excluded.repo_id,
        name = excluded.name,
        event = excluded.event,
        status = excluded.status,
        conclusion = excluded.conclusion,
        head_branch = excluded.head_branch,
        head_sha = excluded.head_sha,
        html_url = excluded.html_url,
        run_started_at = excluded.run_started_at,
        updated_at = excluded.updated_at,
        synced_at = now()
    `;
    workflowRuns += 1;
  }

  for (const release of input.releases ?? []) {
    const repoId = repoIdsByFullName.get(release.repoFullName)
      ?? await getGithubRepoIdByFullName(sql, release.repoFullName);

    if (repoId === undefined) {
      continue;
    }

    await sql`
      insert into github_releases (
        id,
        repo_id,
        tag_name,
        name,
        published_at,
        html_url,
        synced_at
      )
      values (
        ${release.id},
        ${repoId},
        ${release.tagName},
        ${release.name},
        ${release.publishedAt},
        ${release.htmlUrl},
        now()
      )
      on conflict (id) do update set
        repo_id = excluded.repo_id,
        tag_name = excluded.tag_name,
        name = excluded.name,
        published_at = excluded.published_at,
        html_url = excluded.html_url,
        synced_at = now()
    `;
    releases += 1;
  }

  for (const profile of input.repoProfiles ?? []) {
    const repoId = repoIdsByFullName.get(profile.repoFullName)
      ?? await getGithubRepoIdByFullName(sql, profile.repoFullName);

    if (repoId === undefined) {
      continue;
    }

    await sql`
      insert into github_repo_profiles (
        repo_id,
        scan_status,
        scan_error,
        has_readme,
        has_tests,
        has_deployment_config,
        has_architecture_diagram,
        tech_stack,
        evidence_paths,
        scanned_at,
        synced_at
      )
      values (
        ${repoId},
        ${profile.scanStatus},
        ${profile.scanError},
        ${profile.hasReadme},
        ${profile.hasTests},
        ${profile.hasDeploymentConfig},
        ${profile.hasArchitectureDiagram},
        ${profile.techStack},
        ${profile.evidencePaths},
        ${profile.scannedAt},
        now()
      )
      on conflict (repo_id) do update set
        scan_status = excluded.scan_status,
        scan_error = excluded.scan_error,
        has_readme = excluded.has_readme,
        has_tests = excluded.has_tests,
        has_deployment_config = excluded.has_deployment_config,
        has_architecture_diagram = excluded.has_architecture_diagram,
        tech_stack = excluded.tech_stack,
        evidence_paths = excluded.evidence_paths,
        scanned_at = excluded.scanned_at,
        synced_at = now()
    `;
    repoProfiles += 1;
  }

  return {
    commits,
    issues,
    pullRequestChecks,
    pullRequestFiles,
    pullRequestReviews,
    releases,
    repoProfiles,
    pullRequests,
    repos,
    workflowRuns,
  };
}

export async function deleteGithubRepositories(
  sql: SqlClient,
  repositoryIds: number[],
): Promise<number> {
  let deleted = 0;

  for (const repositoryId of new Set(repositoryIds)) {
    await sql`
      delete from github_pull_requests
      where repo_id = ${repositoryId}
    `;
    const rows = await sql<{ id: number }[]>`
      delete from github_repos
      where id = ${repositoryId}
      returning id
    `;

    deleted += rows.length;
  }

  return deleted;
}

export async function deleteGithubPullRequestMetadata(
  sql: SqlClient,
  pullRequestIds: number[],
): Promise<{
  checks: number;
  files: number;
  reviews: number;
}> {
  let checks = 0;
  let files = 0;
  let reviews = 0;

  for (const pullRequestId of new Set(pullRequestIds)) {
    const deletedChecks = await sql<{ id: number }[]>`
      delete from github_pr_checks
      where pull_request_id = ${pullRequestId}
      returning id
    `;
    const deletedFiles = await sql<{ pull_request_id: number }[]>`
      delete from github_pr_files
      where pull_request_id = ${pullRequestId}
      returning pull_request_id
    `;
    const deletedReviews = await sql<{ id: number }[]>`
      delete from github_pr_reviews
      where pull_request_id = ${pullRequestId}
      returning id
    `;

    checks += deletedChecks.length;
    files += deletedFiles.length;
    reviews += deletedReviews.length;
  }

  return { checks, files, reviews };
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

async function githubPullRequestExists(
  sql: SqlClient,
  pullRequestId: number,
): Promise<boolean> {
  const rows = await sql<Array<{ id: string | number }>>`
    select id
    from github_pull_requests
    where id = ${pullRequestId}
    limit 1
  `;

  return rows.length > 0;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
