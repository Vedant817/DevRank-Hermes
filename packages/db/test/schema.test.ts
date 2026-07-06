import assert from "node:assert/strict";
import test from "node:test";
import { migrations } from "../src/schema.js";

test("adds a unique scheduled Slack delivery boundary for existing databases", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "013_slack_delivery_idempotency",
  );

  assert.ok(migration);
  assert.match(migration.sql, /add column if not exists delivery_key text/);
  assert.match(migration.sql, /status in \('pending', 'delivered', 'failed'\)/);
  assert.match(migration.sql, /unique index if not exists slack_notifications_delivery_key_unique/);
});

test("registers the score snapshot rubric version migration", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "015_score_snapshot_rubric_version",
  );

  assert.ok(migration);
  assert.match(migration.sql, /add column if not exists rubric_version text/);
  assert.match(migration.sql, /set rubric_version = 'legacy-v0'/);
  assert.match(migration.sql, /alter column rubric_version set not null/);
});

test("registers persisted GitHub PR check-run evidence", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "016_github_pr_checks",
  );

  assert.ok(migration);
  assert.match(migration.sql, /add column if not exists head_sha text/);
  assert.match(migration.sql, /create table if not exists github_pr_checks/);
  assert.match(migration.sql, /references github_pull_requests\(id\) on delete cascade/);
  assert.match(migration.sql, /github_pr_checks_pull_request_idx/);
  assert.match(migration.sql, /github_pr_checks_pull_request_head_idx/);
});

test("registers the skills and skill evidence migration", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "017_skills_and_skill_evidence",
  );

  assert.ok(migration);
  assert.match(migration.sql, /create table if not exists skills/);
  assert.match(migration.sql, /create table if not exists skill_evidence/);
  assert.match(migration.sql, /references skills\(id\) on delete cascade/);
  assert.match(migration.sql, /skill_evidence_skill_source_unique/);
  assert.match(migration.sql, /skill_evidence_source_idx/);
});
