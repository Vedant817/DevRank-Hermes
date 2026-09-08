import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import {
  deleteGithubPullRequestMetadata,
  deleteGithubRepositories,
  upsertGithubBackfill,
} from "../src/github.js";
import {
  claimGithubWebhookDelivery,
  claimLinearWebhookDelivery,
  claimSlackNotificationAttempt,
  dailyTaskKey,
  deleteLinearEntities,
  getRecentScoreSnapshots,
  insertDailyPlan,
  insertEvidenceItemIfAbsent,
  reclaimLinearWebhookDelivery,
} from "../src/repositories.js";

type SqlCall = {
  text: string;
  values: unknown[];
};

test("insertEvidenceItemIfAbsent reports whether the idempotency key was claimed", async () => {
  const item = {
    id: "dsa:two-sum:2026-09-08",
    source: "manual" as const,
    title: "Solved DSA: Two Sum",
    summary: "Solved an algorithm problem.",
    occurredAt: "2026-09-08T12:00:00.000Z",
  };
  const inserted = recordingSql([{ id: "memory-id" }]);
  const duplicate = recordingSql([]);

  assert.equal(await insertEvidenceItemIfAbsent(inserted.sql, item), true);
  assert.equal(await insertEvidenceItemIfAbsent(duplicate.sql, item), false);
  assert.match(normalizedSql(requiredCall(inserted.calls, "insert into memory_items")), /do nothing returning id::text/);
});

test("insertDailyPlan deletes task rows missing from regenerated plans", async () => {
  const { calls, sql } = recordingSql();
  const task = {
    category: "backend" as const,
    evidence: "Previous score snapshot",
    minutes: 45,
    title: "Build webhook retry tests",
  };

  await insertDailyPlan(sql, {
    date: "2026-06-23",
    targetMinutes: 45,
    tasks: [task],
  });

  const deleteCall = requiredCall(calls, "delete from daily_tasks");

  assert.match(normalizedSql(deleteCall), /task_key <> all/);
  assert.equal(deleteCall.values[0], "2026-06-23");
  assert.deepEqual(deleteCall.values[1], [dailyTaskKey("2026-06-23", task)]);
});

test("insertDailyPlan deletes all task rows when regenerated plan is empty", async () => {
  const { calls, sql } = recordingSql();

  await insertDailyPlan(sql, {
    date: "2026-06-23",
    targetMinutes: 0,
    tasks: [],
  });

  const deleteCall = requiredCall(calls, "delete from daily_tasks");

  assert.doesNotMatch(normalizedSql(deleteCall), /task_key <> all/);
  assert.deepEqual(deleteCall.values, ["2026-06-23"]);
});

test("webhook delivery claims reclaim stale processing rows", async () => {
  const github = recordingSql();
  const linear = recordingSql();

  await claimGithubWebhookDelivery(github.sql, {
    deliveryId: "github-delivery",
    event: "pull_request",
  });
  await claimLinearWebhookDelivery(linear.sql, {
    deliveryId: "linear-delivery",
    eventType: "Issue",
    webhookTimestamp: "2026-06-23T00:00:00.000Z",
  });

  const githubClaim = requiredCall(github.calls, "insert into github_webhook_events");
  const linearClaim = requiredCall(linear.calls, "insert into linear_webhook_events");

  assert.match(normalizedSql(githubClaim), /github_webhook_events.status = 'failed'/);
  assert.match(normalizedSql(githubClaim), /github_webhook_events.status = 'processing'/);
  assert.match(normalizedSql(githubClaim), /received_at < now\(\) - interval '10 minutes'/);
  assert.match(normalizedSql(linearClaim), /linear_webhook_events.status = 'failed'/);
  assert.match(normalizedSql(linearClaim), /linear_webhook_events.status = 'processing'/);
  assert.match(normalizedSql(linearClaim), /received_at < now\(\) - interval '10 minutes'/);
});

test("stale Linear retries only reclaim known failed or abandoned deliveries", async () => {
  const { calls, sql } = recordingSql();

  await reclaimLinearWebhookDelivery(sql, {
    action: "update",
    deliveryId: "linear-delivery",
    eventType: "Issue",
    webhookTimestamp: "2026-06-23T00:00:00.000Z",
  });

  const reclaim = requiredCall(calls, "update linear_webhook_events");
  const statement = normalizedSql(reclaim);

  assert.doesNotMatch(statement, /insert into linear_webhook_events/);
  assert.match(statement, /where delivery_id =/);
  assert.match(statement, /status = 'failed'/);
  assert.match(statement, /received_at < now\(\) - interval '30 seconds'/);
  assert.equal(reclaim.values.at(-1), "linear-delivery");
});

test("Linear project deletion detaches surviving issues before deleting the project", async () => {
  const { calls, sql } = recordingSql();

  await deleteLinearEntities(sql, {
    issueIds: ["issue-1"],
    projectIds: ["project-1"],
  });

  const issueDelete = requiredCall(calls, "delete from linear_issues");
  const projectDetach = requiredCall(calls, "update linear_issues");
  const projectDelete = requiredCall(calls, "delete from linear_projects");

  assert.equal(issueDelete.values[0], "issue-1");
  assert.equal(projectDetach.values[0], "project-1");
  assert.equal(projectDelete.values[0], "project-1");
  assert.ok(calls.indexOf(projectDetach) < calls.indexOf(projectDelete));
});

test("GitHub repository deletion removes dependent pull requests before the repository", async () => {
  const { calls, sql } = recordingSql();

  await deleteGithubRepositories(sql, [101]);

  const pullRequestDelete = requiredCall(calls, "delete from github_pull_requests");
  const repositoryDelete = requiredCall(calls, "delete from github_repos");

  assert.equal(pullRequestDelete.values[0], 101);
  assert.equal(repositoryDelete.values[0], 101);
  assert.ok(calls.indexOf(pullRequestDelete) < calls.indexOf(repositoryDelete));
});

test("GitHub pull request metadata replacement clears stale checks, files, and reviews", async () => {
  const { calls, sql } = recordingSqlSequence([
    [{ id: 401 }, { id: 402 }],
    [{ pull_request_id: 202 }, { pull_request_id: 202 }],
    [{ id: 301 }],
  ]);

  const deleted = await deleteGithubPullRequestMetadata(sql, [202, 202]);

  const checkDelete = requiredCall(calls, "delete from github_pr_checks");
  const fileDelete = requiredCall(calls, "delete from github_pr_files");
  const reviewDelete = requiredCall(calls, "delete from github_pr_reviews");
  assert.deepEqual(deleted, { checks: 2, files: 2, reviews: 1 });
  assert.equal(checkDelete.values[0], 202);
  assert.equal(fileDelete.values[0], 202);
  assert.equal(reviewDelete.values[0], 202);
  assert.equal(calls.filter((call) => normalizedSql(call).includes("delete from github_pr_files")).length, 1);
});

test("persists GitHub check runs as idempotent PR metadata", async () => {
  const { calls, sql } = recordingSqlSequence([
    [{ id: 202 }],
    [],
    [{ id: 202 }],
    [],
  ]);

  const written = await upsertGithubBackfill(sql, {
    commits: [],
    pullRequestChecks: [{
      appSlug: "github-actions",
      completedAt: "2026-06-25T00:05:00.000Z",
      conclusion: "success",
      detailsUrl: "https://github.com/salescode/devrank-os/actions/runs/401",
      headSha: "abc123",
      id: 401,
      name: "test",
      pullRequestId: 202,
      pullRequestNumber: 7,
      repoFullName: "salescode/devrank-os",
      startedAt: "2026-06-25T00:00:00.000Z",
      status: "completed",
    }],
    pullRequestCheckSnapshots: [{
      headSha: "abc123",
      pullRequestId: 202,
      pullRequestNumber: 7,
      repoFullName: "salescode/devrank-os",
    }],
    pullRequestFiles: [],
    pullRequestReviews: [],
    pullRequests: [],
    repoProfiles: [],
    repos: [],
  });
  const deleteCall = requiredCall(calls, "delete from github_pr_checks");
  const insert = requiredCall(calls, "insert into github_pr_checks");

  assert.equal(written.pullRequestChecks, 1);
  assert.equal(deleteCall.values[0], 202);
  assert.ok(calls.indexOf(deleteCall) < calls.indexOf(insert));
  assert.match(normalizedSql(insert), /on conflict \(id\) do update/);
  assert.deepEqual(insert.values.slice(0, 4), [401, 202, "abc123", "test"]);
});

test("persists GitHub pull request head SHA for current-head CI scoring", async () => {
  const { calls, sql } = recordingSql();

  await upsertGithubBackfill(sql, {
    commits: [],
    pullRequestFiles: [],
    pullRequestReviews: [],
    pullRequests: [{
      headSha: "pr-head-123",
      htmlUrl: "https://github.com/salescode/devrank-os/pull/7",
      id: 202,
      mergedAt: null,
      number: 7,
      repoFullName: "salescode/devrank-os",
      state: "open",
      title: "Add CI evidence",
      updatedAt: "2026-06-25T00:00:00.000Z",
    }],
    repoProfiles: [],
    repos: [{
      defaultBranch: "master",
      fullName: "salescode/devrank-os",
      htmlUrl: "https://github.com/salescode/devrank-os",
      id: 101,
      language: "TypeScript",
      name: "devrank-os",
      owner: "salescode",
      private: false,
      pushedAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    }],
  });

  const insert = requiredCall(calls, "insert into github_pull_requests");

  assert.match(normalizedSql(insert), /head_sha/);
  assert.equal(insert.values[5], "pr-head-123");
});

test("persists GitHub issues and workflow runs from webhook backfill", async () => {
  const { calls, sql } = recordingSql();

  const written = await upsertGithubBackfill(sql, {
    issues: [{
      authorLogin: "vedantmahajan271",
      closedAt: null,
      htmlUrl: "https://github.com/salescode/devrank-os/issues/42",
      id: 9001,
      number: 42,
      openedAt: "2026-06-22T06:00:00.000Z",
      repoFullName: "salescode/devrank-os",
      state: "open",
      title: "Backfill misses issue activity",
      updatedAt: "2026-06-22T06:05:00.000Z",
    }],
    pullRequests: [],
    repos: [{
      defaultBranch: "master",
      fullName: "salescode/devrank-os",
      htmlUrl: "https://github.com/salescode/devrank-os",
      id: 101,
      language: "TypeScript",
      name: "devrank-os",
      owner: "salescode",
      private: false,
      pushedAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    }],
    workflowRuns: [{
      conclusion: "success",
      event: "push",
      headBranch: "master",
      headSha: "abc123",
      htmlUrl: "https://github.com/salescode/devrank-os/actions/runs/555",
      id: 555,
      name: "CI",
      repoFullName: "salescode/devrank-os",
      runStartedAt: "2026-06-22T07:00:00.000Z",
      status: "completed",
      updatedAt: "2026-06-22T07:10:00.000Z",
    }],
  });
  const issueInsert = requiredCall(calls, "insert into github_issues");
  const workflowRunInsert = requiredCall(calls, "insert into github_workflow_runs");

  assert.equal(written.issues, 1);
  assert.equal(written.workflowRuns, 1);
  assert.match(normalizedSql(issueInsert), /on conflict \(id\) do update/);
  assert.deepEqual(issueInsert.values.slice(0, 4), [9001, 101, 42, "Backfill misses issue activity"]);
  assert.match(normalizedSql(workflowRunInsert), /on conflict \(id\) do update/);
  assert.deepEqual(workflowRunInsert.values.slice(0, 3), [555, 101, "CI"]);
});

test("scheduled Slack delivery claims are idempotent and reclaim only failed or abandoned rows", async () => {
  const claimed = recordingSqlSequence([
    [{ id: "notification-1", status: "pending" }],
  ]);
  const duplicate = recordingSqlSequence([
    [],
    [{ id: "notification-1", status: "delivered" }],
  ]);

  const first = await claimSlackNotificationAttempt(claimed.sql, {
    deliveryKey: "daily-plan:2026-06-25",
    text: "Daily plan",
  });
  const second = await claimSlackNotificationAttempt(duplicate.sql, {
    deliveryKey: "daily-plan:2026-06-25",
    text: "Daily plan",
  });
  const claimCall = requiredCall(claimed.calls, "insert into slack_notifications");

  assert.deepEqual(first, {
    claimed: true,
    id: "notification-1",
    status: "pending",
  });
  assert.deepEqual(second, {
    claimed: false,
    id: "notification-1",
    status: "delivered",
  });
  assert.match(normalizedSql(claimCall), /on conflict \(delivery_key\)/);
  assert.match(normalizedSql(claimCall), /slack_notifications.status = 'failed'/);
  assert.match(normalizedSql(claimCall), /claimed_at < now\(\) - interval '10 minutes'/);
});

test("loads a bounded score history in newest-first order", async () => {
  const { calls, sql } = recordingSql([
    {
      breakdown: JSON.stringify([
        {
          evidenceCount: 2,
          explanation: "Matched evidence.",
          label: "Backend/API",
          score: 70,
          weight: 0.15,
        },
      ]),
      created_at: new Date("2026-06-24T00:00:00.000Z"),
      overall: "64",
      rubric_version: "sde-readiness-v2",
    },
  ]);

  const snapshots = await getRecentScoreSnapshots(sql, 1_000);
  const query = requiredCall(calls, "from score_snapshots");

  assert.equal(query.values[0], 100);
  assert.equal(snapshots[0]?.overall, 64);
  assert.equal(snapshots[0]?.generatedAt, "2026-06-24T00:00:00.000Z");
  assert.equal(snapshots[0]?.breakdown[0]?.label, "Backend/API");
  assert.equal(snapshots[0]?.rubricVersion, "sde-readiness-v2");
  assert.match(normalizedSql(query), /rubric_version/);
});

function recordingSql(result: unknown[] = []) {
  const calls: SqlCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({
      text: strings.join("?"),
      values,
    });

    return Promise.resolve(result);
  }) as unknown as SqlClient;
  Object.assign(sql, {
    begin: async <T>(work: (transaction: SqlClient) => Promise<T>) => work(sql),
  });

  return { calls, sql };
}

function recordingSqlSequence(results: unknown[][]) {
  const calls: SqlCall[] = [];
  let index = 0;
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({
      text: strings.join("?"),
      values,
    });

    const result = results[index] ?? [];
    index += 1;
    return Promise.resolve(result);
  }) as unknown as SqlClient;
  Object.assign(sql, {
    begin: async <T>(work: (transaction: SqlClient) => Promise<T>) => work(sql),
  });

  return { calls, sql };
}

function requiredCall(calls: SqlCall[], pattern: string) {
  const call = calls.find((candidate) => candidate.text.includes(pattern));

  assert.ok(call, `Expected SQL call containing "${pattern}".`);

  return call;
}

function normalizedSql(call: SqlCall) {
  return call.text.replace(/\s+/g, " ").trim();
}
