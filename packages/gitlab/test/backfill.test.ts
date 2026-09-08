import assert from "node:assert/strict";
import test from "node:test";
import { backfillGitlabUser, type GitlabClient } from "../src/index.js";

test("backfills owned non-fork projects and user-authored activity sequentially", async () => {
  const calls: Array<{ path: string; query: Record<string, string | number | boolean> }> = [];
  const client: GitlabClient = {
    async getPage(path, query) {
      calls.push({ path, query });

      if (path.includes("repository/commits")) {
        return { items: [commit()], nextPage: null };
      }

      if (path.includes("merge_requests")) {
        return { items: [mergeRequest()], nextPage: null };
      }

      return {
        items: [project(101), { ...project(102), forked_from_project: { id: 1 } }],
        nextPage: null,
      };
    },
  };

  const result = await backfillGitlabUser(client, "user/name", {
    commitLimitPerProject: 250,
    mergeRequestLimitPerProject: 250,
    perPage: 500,
    projectLimit: 50,
  });

  assert.equal(result.projects.length, 1);
  assert.equal(result.commits.length, 1);
  assert.equal(result.mergeRequests.length, 1);
  assert.deepEqual(calls.map((call) => call.path), [
    "/users/user%2Fname/projects",
    "/projects/101/repository/commits",
    "/projects/101/merge_requests",
  ]);
  assert.equal(calls[0]?.query.owned, true);
  assert.equal(calls[0]?.query.per_page, 100);
  assert.equal(calls[1]?.query.author, "user/name");
  assert.equal(calls[1]?.query.per_page, 100);
  assert.equal(calls[2]?.query.author_username, "user/name");
});

test("does not request activity for empty or default-branchless projects", async () => {
  const paths: string[] = [];
  const client: GitlabClient = {
    async getPage(path) {
      paths.push(path);
      return {
        items: [
          { ...project(101), empty_repo: true },
          { ...project(102), default_branch: null },
        ],
        nextPage: null,
      };
    },
  };

  const result = await backfillGitlabUser(client, "alice");

  assert.equal(result.projects.length, 2);
  assert.deepEqual(result.commits, []);
  assert.deepEqual(result.mergeRequests, []);
  assert.equal(paths.length, 1);
});

test("rejects pagination that continues beyond the configured cap", async () => {
  const client: GitlabClient = {
    async getPage() {
      return { items: [], nextPage: 11 };
    },
  };

  await assert.rejects(backfillGitlabUser(client, "alice"), /10-page cap/);
});

test("validates usernames and response item fields", async () => {
  const client: GitlabClient = {
    async getPage() {
      return { items: [{ id: "not-numeric" }], nextPage: null };
    },
  };

  await assert.rejects(backfillGitlabUser(client, "   "), /must not be empty/);
  await assert.rejects(backfillGitlabUser(client, "x".repeat(256)), /255 characters/);
  await assert.rejects(backfillGitlabUser(client, "alice"), /invalid project.id/);
});

function project(id: number) {
  return {
    archived: false,
    default_branch: "main",
    empty_repo: false,
    forked_from_project: null,
    id,
    last_activity_at: "2026-09-08T00:00:00.000Z",
    name: `project-${id}`,
    path_with_namespace: `alice/project-${id}`,
    visibility: "public",
    web_url: `https://gitlab.example/alice/project-${id}`,
  };
}

function commit() {
  return {
    author_name: "Alice",
    authored_date: "2026-09-07T00:00:00.000Z",
    committed_date: "2026-09-07T00:00:00.000Z",
    id: "abcdef1234567890",
    message: "Update implementation",
    title: "Update implementation",
    web_url: "https://gitlab.example/alice/project/-/commit/abcdef1234567890",
  };
}

function mergeRequest() {
  return {
    author: { username: "alice" },
    created_at: "2026-09-06T00:00:00.000Z",
    id: 501,
    iid: 7,
    merged_at: null,
    source_branch: "feature",
    state: "opened",
    target_branch: "main",
    title: "Update implementation",
    updated_at: "2026-09-07T00:00:00.000Z",
    web_url: "https://gitlab.example/alice/project/-/merge_requests/7",
  };
}
