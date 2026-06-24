import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import { deleteGithubRepositories } from "../src/github.js";
import {
  claimGithubWebhookDelivery,
  claimLinearWebhookDelivery,
  dailyTaskKey,
  deleteLinearEntities,
  getRecentScoreSnapshots,
  insertDailyPlan,
  reclaimLinearWebhookDelivery,
} from "../src/repositories.js";

type SqlCall = {
  text: string;
  values: unknown[];
};

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
    },
  ]);

  const snapshots = await getRecentScoreSnapshots(sql, 1_000);
  const query = requiredCall(calls, "from score_snapshots");

  assert.equal(query.values[0], 100);
  assert.equal(snapshots[0]?.overall, 64);
  assert.equal(snapshots[0]?.generatedAt, "2026-06-24T00:00:00.000Z");
  assert.equal(snapshots[0]?.breakdown[0]?.label, "Backend/API");
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

function requiredCall(calls: SqlCall[], pattern: string) {
  const call = calls.find((candidate) => candidate.text.includes(pattern));

  assert.ok(call, `Expected SQL call containing "${pattern}".`);

  return call;
}

function normalizedSql(call: SqlCall) {
  return call.text.replace(/\s+/g, " ").trim();
}
