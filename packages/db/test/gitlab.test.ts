import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import {
  listGitlabCommitEvidence,
  listGitlabMergeRequestEvidence,
  listGitlabProjectEvidence,
  upsertGitlabBackfill,
} from "../src/gitlab.js";
import { listScoringEvidence } from "../src/repositories.js";

type SqlCall = { text: string; values: unknown[] };

test("upserts GitLab backfill rows idempotently without reconciliation deletes", async () => {
  const previousOwner = process.env.DEVRANK_OWNER_ID;
  process.env.DEVRANK_OWNER_ID = "owner-one";
  const { calls, sql } = recordingSql();

  try {
    const written = await upsertGitlabBackfill(sql, {
      projects: [{
        archived: false,
        defaultBranch: "main",
        emptyRepo: false,
        id: 101,
        lastActivityAt: "2026-09-08T00:00:00.000Z",
        name: "project",
        pathWithNamespace: "alice/project",
        visibility: "public",
        webUrl: "https://gitlab.example/alice/project",
      }],
      commits: [{
        authorName: "Alice",
        authoredAt: "2026-09-07T00:00:00.000Z",
        committedAt: "2026-09-07T00:00:00.000Z",
        message: "Update implementation",
        projectId: 101,
        projectPath: "alice/project",
        sha: "abcdef1234567890",
        title: "Update implementation",
        webUrl: null,
      }],
      mergeRequests: [{
        authorUsername: "alice",
        createdAt: "2026-09-06T00:00:00.000Z",
        id: 501,
        iid: 7,
        mergedAt: null,
        projectId: 101,
        projectPath: "alice/project",
        sourceBranch: "feature",
        state: "opened",
        targetBranch: "main",
        title: "Update implementation",
        updatedAt: "2026-09-07T00:00:00.000Z",
        webUrl: null,
      }],
    });

    assert.deepEqual(written, { commits: 1, mergeRequests: 1, projects: 1 });
    assert.match(normalizedSql(requiredCall(calls, "insert into gitlab_projects")), /on conflict \(id\) do update/);
    assert.match(normalizedSql(requiredCall(calls, "insert into gitlab_commits")), /on conflict \(project_id, sha\) do update/);
    assert.match(normalizedSql(requiredCall(calls, "insert into gitlab_merge_requests")), /on conflict \(id\) do update/);
    assert.equal(requiredCall(calls, "insert into gitlab_projects").values[1], "owner-one");
    assert.equal(calls.some((call) => /delete from gitlab_/.test(normalizedSql(call))), false);
  } finally {
    if (previousOwner === undefined) delete process.env.DEVRANK_OWNER_ID;
    else process.env.DEVRANK_OWNER_ID = previousOwner;
  }
});

test("maps GitLab project, commit, and merge request rows to neutral evidence", async () => {
  const project = recordingSql([{
    id: 101,
    last_activity_at: "2026-09-08T00:00:00.000Z",
    path_with_namespace: "alice/project",
    synced_at: "2026-09-08T00:00:00.000Z",
    visibility: "public",
    web_url: null,
  }]);
  const commit = recordingSql([{
    author_name: "Alice",
    committed_at: "2026-09-07T00:00:00.000Z",
    message: "Update implementation",
    path_with_namespace: "alice/project",
    sha: "abcdef1234567890",
    synced_at: "2026-09-08T00:00:00.000Z",
    title: "Update implementation",
    web_url: null,
  }]);
  const mergeRequest = recordingSql([{
    author_username: "alice",
    iid: 7,
    merged_at: null,
    path_with_namespace: "alice/project",
    state: "opened",
    synced_at: "2026-09-08T00:00:00.000Z",
    title: "Update implementation",
    updated_at: "2026-09-07T00:00:00.000Z",
    web_url: null,
  }]);

  const evidence = [
    ...await listGitlabProjectEvidence(project.sql, undefined, 100),
    ...await listGitlabCommitEvidence(commit.sql, undefined, 100),
    ...await listGitlabMergeRequestEvidence(mergeRequest.sql, undefined, 100),
  ];

  assert.equal(evidence.length, 3);
  assert.ok(evidence.every((item) => item.source === "gitlab"));
  assert.ok(evidence.every((item) => `${item.title} ${item.summary}`.toLowerCase().includes("repository")));
  assert.ok(evidence.every((item) => !("authorEmail" in (item.metadata ?? {}))));
});

test("includes all GitLab evidence functions in all and repository scopes", async () => {
  const all = recordingSql();
  const repo = recordingSql();

  await listScoringEvidence(all.sql, { scope: "all" });
  await listScoringEvidence(repo.sql, { scope: "repo", targetId: "alice/project" });

  for (const calls of [all.calls, repo.calls]) {
    assert.ok(calls.some((call) => normalizedSql(call).includes("from gitlab_projects")));
    assert.ok(calls.some((call) => normalizedSql(call).includes("from gitlab_commits")));
    assert.ok(calls.some((call) => normalizedSql(call).includes("from gitlab_merge_requests")));
  }
});

function recordingSql(result: unknown[] = []) {
  const calls: SqlCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(result);
  }) as unknown as SqlClient;

  return { calls, sql };
}

function requiredCall(calls: SqlCall[], text: string) {
  const call = calls.find((candidate) => normalizedSql(candidate).includes(text));
  assert.ok(call, `Expected SQL containing ${text}`);
  return call;
}

function normalizedSql(call: SqlCall) {
  return call.text.replace(/\s+/g, " ").trim().toLowerCase();
}
