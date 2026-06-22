import test from "node:test";
import assert from "node:assert/strict";
import { linearWebhookIngestion, summarizeLinearWebhook } from "../src/webhook.js";

test("extracts issue and project rows from Linear issue webhook payload", () => {
  const ingestion = linearWebhookIngestion({
    action: "create",
    type: "Issue",
    organizationId: "org-1",
    data: {
      id: "issue-1",
      identifier: "DEV-12",
      title: "Persist Linear webhook",
      priority: 2,
      url: "https://linear.app/devrank/issue/DEV-12",
      state: { name: "In Progress" },
      assignee: { name: "Vedant" },
      project: {
        id: "project-1",
        name: "DevRank OS",
        state: "started",
        progress: 42,
        url: "https://linear.app/devrank/project/devrank-os",
        team: { name: "Platform" },
      },
    },
  });

  assert.equal(ingestion.summary.action, "create");
  assert.equal(ingestion.backfill.projects.length, 1);
  assert.equal(ingestion.backfill.projects[0]?.name, "DevRank OS");
  assert.equal(ingestion.backfill.issues.length, 1);
  assert.equal(ingestion.backfill.issues[0]?.projectId, "project-1");
  assert.equal(ingestion.backfill.issues[0]?.state, "In Progress");
});

test("extracts project rows from Linear project webhook payload", () => {
  const ingestion = linearWebhookIngestion({
    action: "update",
    type: "Project",
    data: {
      id: "project-1",
      name: "DevRank OS",
      state: "started",
      progress: 55,
      url: "https://linear.app/devrank/project/devrank-os",
      team: { name: "Platform" },
    },
  });

  assert.equal(ingestion.backfill.projects.length, 1);
  assert.deepEqual(ingestion.backfill.issues, []);
});

test("summarizes sparse Linear payloads without throwing", () => {
  assert.deepEqual(summarizeLinearWebhook({}), {
    action: undefined,
    type: undefined,
    organizationId: undefined,
    url: undefined,
  });
});
