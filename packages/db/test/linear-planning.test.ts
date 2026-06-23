import assert from "node:assert/strict";
import test from "node:test";
import { buildLinearSyncHealth } from "../src/index.js";

test("builds healthy Linear sync health from the latest successful ingestion run", () => {
  const health = buildLinearSyncHealth({
    source: "linear_backfill",
    status: "success",
    summary: "Imported 2 Linear project(s) and 8 issue(s).",
    finishedAt: "2026-06-23T10:00:00.000Z",
  });

  assert.equal(health.status, "healthy");
  assert.equal(health.source, "linear_backfill");
  assert.match(health.message, /completed successfully/);
  assert.equal(health.summary, "Imported 2 Linear project(s) and 8 issue(s).");
});

test("builds failed Linear sync health with redacted operational error text", () => {
  const health = buildLinearSyncHealth({
    source: "linear_webhook",
    status: "failed",
    error: "request failed with token=sk-secretsecretsecret and postgres://user:pass@example/db",
    finishedAt: "2026-06-23T10:05:00.000Z",
  });

  assert.equal(health.status, "failed");
  assert.equal(health.source, "linear_webhook");
  assert.match(health.message, /Latest Linear sync failed/);
  assert.equal(
    health.error,
    "request failed with token=[REDACTED_SECRET] and [REDACTED_DATABASE_URL]",
  );
});

test("builds unknown Linear sync health when no sync run exists", () => {
  const health = buildLinearSyncHealth();

  assert.equal(health.status, "unknown");
  assert.match(health.message, /No Linear sync run/);
});
