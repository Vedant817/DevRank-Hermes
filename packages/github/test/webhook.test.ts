import test from "node:test";
import assert from "node:assert/strict";
import { githubWebhookIngestion, summarizeGithubWebhook } from "../src/webhook.js";

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
  });
  assert.equal(ingestion.backfill.repos.length, 1);
  assert.equal(ingestion.backfill.repos[0]?.fullName, "salescode/devrank-os");
  assert.equal(ingestion.backfill.pullRequests.length, 1);
  assert.equal(ingestion.backfill.pullRequests[0]?.repoFullName, "salescode/devrank-os");
});

test("keeps push webhook ingestion repo-only", () => {
  const ingestion = githubWebhookIngestion("push", "delivery-2", {
    repository: {
      id: 101,
      full_name: "salescode/devrank-os",
      name: "devrank-os",
      owner: { login: "salescode" },
    },
  });

  assert.equal(ingestion.backfill.repos.length, 1);
  assert.deepEqual(ingestion.backfill.pullRequests, []);
});

test("summarizes sparse payloads without throwing", () => {
  assert.deepEqual(summarizeGithubWebhook("push", "delivery-3", {}), {
    eventName: "push",
    deliveryId: "delivery-3",
    action: undefined,
    repository: undefined,
    pullRequestNumber: undefined,
  });
});
