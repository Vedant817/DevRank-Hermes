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

test("registers the GitHub issues and workflow runs migration", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "018_github_issues_and_workflow_runs",
  );

  assert.ok(migration);
  assert.match(migration.sql, /create table if not exists github_issues/);
  assert.match(migration.sql, /create table if not exists github_workflow_runs/);
  assert.match(migration.sql, /references github_repos\(id\) on delete cascade/);
  assert.match(migration.sql, /github_issues_repo_idx/);
  assert.match(migration.sql, /github_workflow_runs_repo_idx/);
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

test("registers the DSA question bank migration with a seeded, idempotent insert", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "019_dsa_questions",
  );

  assert.ok(migration);
  assert.match(migration.sql, /create table if not exists dsa_questions/);
  assert.match(migration.sql, /difficulty text not null check \(difficulty in \('easy', 'medium', 'hard'\)\)/);
  assert.match(migration.sql, /dsa_questions_topic_difficulty_idx/);
  assert.match(migration.sql, /insert into dsa_questions/);
  assert.match(migration.sql, /on conflict \(slug\) do nothing/);
  // Seed must cover every weekday topic bucket in the weekly ladder.
  for (const topic of [
    "Arrays/Hashing",
    "Binary Search/Two Pointers",
    "Stack/Queue/Linked List",
    "Trees/Graphs",
    "Dynamic Programming",
  ]) {
    assert.ok(migration.sql.includes(topic), `seed missing topic: ${topic}`);
  }
});

test("registers the benchmark snapshots migration", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "020_benchmark_snapshots",
  );

  assert.ok(migration);
  assert.match(migration.sql, /create table if not exists benchmark_snapshots/);
  assert.match(migration.sql, /skill_frequency jsonb not null/);
  assert.match(migration.sql, /missing_skills text\[\] not null default '{}'/);
  assert.match(migration.sql, /benchmark_snapshots_generated_at_idx/);
});

test("registers the github releases migration", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "021_github_releases",
  );

  assert.ok(migration);
  assert.match(migration.sql, /create table if not exists github_releases/);
  assert.match(migration.sql, /id bigint primary key/);
  assert.match(migration.sql, /references github_repos\(id\) on delete cascade/);
  assert.match(migration.sql, /github_releases_repo_idx/);
});

test("registers the learning goals and outcomes migration", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "022_learning_goals_and_outcomes",
  );

  assert.ok(migration);
  assert.match(migration.sql, /create table if not exists learning_goals/);
  assert.match(migration.sql, /check \(status in \('active', 'done', 'abandoned'\)\)/);
  assert.match(migration.sql, /create table if not exists outcome_events/);
  assert.match(migration.sql, /check \(event_type in \('application', 'interview', 'offer', 'rejection'\)\)/);
  assert.match(migration.sql, /outcome_events_occurred_at_idx/);
});

test("registers the owner id prep migration", () => {
  const migration = migrations.find(
    (candidate) => candidate.id === "023_owner_id_prep",
  );

  assert.ok(migration);
  assert.match(migration.sql, /alter table scores add column if not exists owner_id text/);
  assert.match(migration.sql, /alter table score_snapshots add column if not exists owner_id text/);
  assert.match(migration.sql, /alter table daily_plans add column if not exists owner_id text/);
  assert.match(migration.sql, /alter table memory_items add column if not exists owner_id text/);
  assert.match(migration.sql, /alter table github_repos add column if not exists owner_id text/);
});
