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
