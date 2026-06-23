import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import {
  claimGithubWebhookDelivery,
  claimLinearWebhookDelivery,
  dailyTaskKey,
  insertDailyPlan,
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

function recordingSql() {
  const calls: SqlCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({
      text: strings.join("?"),
      values,
    });

    return Promise.resolve([]);
  }) as unknown as SqlClient;

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
