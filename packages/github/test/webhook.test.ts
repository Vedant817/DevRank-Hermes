import test from "node:test";
import assert from "node:assert/strict";
import {
  githubWebhookIngestion,
  isSupportedGithubWebhookEvent,
  summarizeGithubWebhook,
} from "../src/webhook.js";

test("extracts repo and pull request rows from GitHub webhook payload", () => {
  const payload = {
    action: "opened",
    repository: {
      id: 101,
      full_name: "salescode/devrank-os",
      name: "devrank-os",
      owner: { login: "salescode" },
      private: false,
      default_branch: "master",
      html_url: "https://github.com/salescode/devrank-os",
      language: "TypeScript",
      pushed_at: "2026-06-22T01:00:00Z",
      updated_at: "2026-06-22T02:00:00Z",
    },
    pull_request: {
      id: 202,
      number: 7,
      title: "Persist GitHub webhooks",
      state: "open",
      html_url: "https://github.com/salescode/devrank-os/pull/7",
      merged_at: null,
      updated_at: "2026-06-22T03:00:00Z",
    },
  };

  const ingestion = githubWebhookIngestion("pull_request", "delivery-1", payload);

  assert.deepEqual(ingestion.summary, {
    eventName: "pull_request",
    deliveryId: "delivery-1",
    action: "opened",
    repository: "salescode/devrank-os",
    pullRequestNumber: 7,
    pullRequestNumbers: [7],
  });
  assert.equal(ingestion.backfill.repos.length, 1);
  assert.equal(ingestion.backfill.repos[0]?.fullName, "salescode/devrank-os");
  assert.equal(ingestion.backfill.pullRequests.length, 1);
  assert.equal(ingestion.backfill.pullRequests[0]?.repoFullName, "salescode/devrank-os");
  assert.deepEqual(ingestion.backfill.commits, []);
});

test("extracts push webhook commits", () => {
  const ingestion = githubWebhookIngestion("push", "delivery-2", {
    ref: "refs/heads/master",
    repository: {
      id: 101,
      full_name: "salescode/devrank-os",
      name: "devrank-os",
      owner: { login: "salescode" },
    },
    commits: [{
      id: "abc123",
      message: "Ship GitHub commit ingestion",
      timestamp: "2026-06-22T04:00:00Z",
      url: "https://github.com/salescode/devrank-os/commit/abc123",
      author: {
        username: "salescode",
      },
    }],
  });

  assert.equal(ingestion.backfill.repos.length, 1);
  assert.deepEqual(ingestion.backfill.pullRequests, []);
  assert.deepEqual(ingestion.backfill.commits, [{
    authorLogin: "salescode",
    branch: "master",
    committedAt: "2026-06-22T04:00:00Z",
    htmlUrl: "https://github.com/salescode/devrank-os/commit/abc123",
    message: "Ship GitHub commit ingestion",
    repoFullName: "salescode/devrank-os",
    sha: "abc123",
  }]);
});

test("supports repository.created without accepting every repository action", () => {
  assert.equal(isSupportedGithubWebhookEvent("repository", "created"), true);
  assert.equal(isSupportedGithubWebhookEvent("repository", "deleted"), true);
  assert.equal(isSupportedGithubWebhookEvent("repository", "archived"), false);

  const ingestion = githubWebhookIngestion("repository", "delivery-4", {
    action: "created",
    repository: {
      id: 303,
      full_name: "salescode/new-service",
      name: "new-service",
      owner: { login: "salescode" },
      private: false,
      default_branch: "main",
      html_url: "https://github.com/salescode/new-service",
      language: "TypeScript",
      pushed_at: "2026-06-22T05:00:00Z",
      updated_at: "2026-06-22T05:00:00Z",
    },
  });

  assert.deepEqual(ingestion.summary, {
    eventName: "repository",
    deliveryId: "delivery-4",
    action: "created",
    repository: "salescode/new-service",
    pullRequestNumber: undefined,
    pullRequestNumbers: [],
  });
  assert.equal(ingestion.backfill.repos.length, 1);
  assert.equal(ingestion.backfill.repos[0]?.fullName, "salescode/new-service");
  assert.deepEqual(ingestion.backfill.pullRequests, []);
  assert.deepEqual(ingestion.backfill.commits, []);
  assert.deepEqual(ingestion.deletions.repositoryIds, []);
});

test("supports check_run webhook payloads for PR CI refresh", () => {
  assert.equal(isSupportedGithubWebhookEvent("check_run", "completed"), true);

  const ingestion = githubWebhookIngestion("check_run", "delivery-6", {
    action: "completed",
    check_run: {
      pull_requests: [{
        number: 7,
      }, {
        number: 8,
      }],
    },
    repository: {
      id: 101,
      full_name: "salescode/devrank-os",
      name: "devrank-os",
      owner: { login: "salescode" },
      private: false,
      default_branch: "master",
      html_url: "https://github.com/salescode/devrank-os",
      language: "TypeScript",
      pushed_at: "2026-06-22T01:00:00Z",
      updated_at: "2026-06-22T02:00:00Z",
    },
  });

  assert.deepEqual(ingestion.summary, {
    eventName: "check_run",
    deliveryId: "delivery-6",
    action: "completed",
    repository: "salescode/devrank-os",
    pullRequestNumber: 7,
    pullRequestNumbers: [7, 8],
  });
  assert.equal(ingestion.backfill.repos.length, 1);
  assert.deepEqual(ingestion.backfill.pullRequests, []);
});

test("supports only the planned issues, release, and workflow_run actions", () => {
  assert.equal(isSupportedGithubWebhookEvent("issues", "opened"), true);
  assert.equal(isSupportedGithubWebhookEvent("issues", "closed"), false);
  assert.equal(isSupportedGithubWebhookEvent("release", "published"), true);
  assert.equal(isSupportedGithubWebhookEvent("release", "created"), false);
  assert.equal(isSupportedGithubWebhookEvent("workflow_run", "completed"), true);
  assert.equal(isSupportedGithubWebhookEvent("workflow_run", "requested"), false);
});

test("extracts issue rows from issues webhook payloads", () => {
  const ingestion = githubWebhookIngestion("issues", "delivery-7", {
    action: "opened",
    issue: {
      id: 9001,
      number: 42,
      title: "Backfill misses issue activity",
      state: "open",
      html_url: "https://github.com/salescode/devrank-os/issues/42",
      created_at: "2026-06-22T06:00:00Z",
      updated_at: "2026-06-22T06:05:00Z",
      closed_at: null,
      user: { login: "vedantmahajan271" },
    },
    repository: {
      id: 101,
      full_name: "salescode/devrank-os",
      name: "devrank-os",
      owner: { login: "salescode" },
    },
  });

  assert.deepEqual(ingestion.backfill.issues, [{
    authorLogin: "vedantmahajan271",
    closedAt: null,
    htmlUrl: "https://github.com/salescode/devrank-os/issues/42",
    id: 9001,
    number: 42,
    openedAt: "2026-06-22T06:00:00Z",
    repoFullName: "salescode/devrank-os",
    state: "open",
    title: "Backfill misses issue activity",
    updatedAt: "2026-06-22T06:05:00Z",
  }]);
});

test("ignores pull-request-shaped issue payloads", () => {
  const ingestion = githubWebhookIngestion("issues", "delivery-8", {
    action: "opened",
    issue: {
      id: 9002,
      number: 43,
      title: "PR masquerading as issue",
      state: "open",
      pull_request: { url: "https://api.github.com/repos/salescode/devrank-os/pulls/43" },
    },
    repository: {
      id: 101,
      full_name: "salescode/devrank-os",
      name: "devrank-os",
      owner: { login: "salescode" },
    },
  });

  assert.deepEqual(ingestion.backfill.issues, []);
});

test("extracts workflow run rows from workflow_run webhook payloads", () => {
  const ingestion = githubWebhookIngestion("workflow_run", "delivery-9", {
    action: "completed",
    workflow_run: {
      id: 555,
      name: "CI",
      event: "push",
      status: "completed",
      conclusion: "success",
      head_branch: "master",
      head_sha: "abc123",
      html_url: "https://github.com/salescode/devrank-os/actions/runs/555",
      run_started_at: "2026-06-22T07:00:00Z",
      updated_at: "2026-06-22T07:10:00Z",
    },
    repository: {
      id: 101,
      full_name: "salescode/devrank-os",
      name: "devrank-os",
      owner: { login: "salescode" },
    },
  });

  assert.deepEqual(ingestion.backfill.workflowRuns, [{
    conclusion: "success",
    event: "push",
    headBranch: "master",
    headSha: "abc123",
    htmlUrl: "https://github.com/salescode/devrank-os/actions/runs/555",
    id: 555,
    name: "CI",
    repoFullName: "salescode/devrank-os",
    runStartedAt: "2026-06-22T07:00:00Z",
    status: "completed",
    updatedAt: "2026-06-22T07:10:00Z",
  }]);
});

test("emits a repository deletion instead of re-upserting deleted GitHub data", () => {
  const ingestion = githubWebhookIngestion("repository", "delivery-5", {
    action: "deleted",
    repository: {
      id: 303,
      full_name: "salescode/removed-service",
      name: "removed-service",
      owner: { login: "salescode" },
    },
  });

  assert.deepEqual(ingestion.deletions.repositoryIds, [303]);
  assert.deepEqual(ingestion.backfill.repos, []);
  assert.deepEqual(ingestion.backfill.pullRequests, []);
});

test("extracts release rows from release.published webhook payloads", () => {
  const ingestion = githubWebhookIngestion("release", "delivery-10", {
    action: "published",
    release: {
      id: 777,
      tag_name: "v2.0.0",
      name: "v2.0.0 Release",
      html_url: "https://github.com/salescode/devrank-os/releases/tag/v2.0.0",
      published_at: "2026-06-22T08:00:00Z",
    },
    repository: {
      id: 101,
      full_name: "salescode/devrank-os",
      name: "devrank-os",
      owner: { login: "salescode" },
    },
  });

  assert.deepEqual(ingestion.backfill.releases, [{
    id: 777,
    repoFullName: "salescode/devrank-os",
    tagName: "v2.0.0",
    name: "v2.0.0 Release",
    htmlUrl: "https://github.com/salescode/devrank-os/releases/tag/v2.0.0",
    publishedAt: "2026-06-22T08:00:00Z",
  }]);
  assert.deepEqual(ingestion.summary, {
    eventName: "release",
    deliveryId: "delivery-10",
    action: "published",
    repository: "salescode/devrank-os",
    pullRequestNumber: undefined,
    pullRequestNumbers: [],
  });
});

test("handles release payload with minimal fields", () => {
  const ingestion = githubWebhookIngestion("release", "delivery-11", {
    action: "published",
    release: {
      id: 778,
    },
    repository: {
      id: 102,
      full_name: "salescode/minimal",
      name: "minimal",
      owner: { login: "salescode" },
    },
  });

  assert.deepEqual(ingestion.backfill.releases, [{
    id: 778,
    repoFullName: "salescode/minimal",
    tagName: null,
    name: null,
    htmlUrl: null,
    publishedAt: null,
  }]);
});

test("summarizes sparse payloads without throwing", () => {
  assert.deepEqual(summarizeGithubWebhook("push", "delivery-3", {}), {
    eventName: "push",
    deliveryId: "delivery-3",
    action: undefined,
    repository: undefined,
    pullRequestNumber: undefined,
    pullRequestNumbers: [],
  });
});
