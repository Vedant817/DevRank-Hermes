import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import { insertBenchmarkSnapshot, getRecentBenchmarkSnapshots, getLatestBenchmarkSnapshot } from "../src/benchmark.js";

type SqlCall = {
  text: string;
  values: unknown[];
};

test("insertBenchmarkSnapshot inserts and returns expected SQL", async () => {
  const { calls, sql } = recordingSql();

  await insertBenchmarkSnapshot(sql, {
    generatedAt: "2026-06-22T00:00:00.000Z",
    queries: ["SDE backend roles"],
    skillFrequency: { typescript: 3, nodejs: 2 },
    missingSkills: ["react", "aws"],
    resumeKeywordGaps: ["Add React experience"],
    weeklyLearningPriorities: ["react", "aws"],
    rawResults: [{ title: "SDE role", content: "..." }],
  });

  const insertCall = requiredCall(calls, "insert into benchmark_snapshots");
  const sqlText = insertCall.text.replace(/\s+/g, " ").trim();

  assert.match(sqlText, /generated_at/);
  assert.match(sqlText, /skill_frequency/);
  assert.match(sqlText, /::jsonb/);
  assert.equal(insertCall.values[0], "2026-06-22T00:00:00.000Z");
  assert.deepEqual(insertCall.values[1], ["SDE backend roles"]);
  assert.deepEqual(insertCall.values[2], JSON.stringify({ typescript: 3, nodejs: 2 }));
  assert.deepEqual(insertCall.values[6], JSON.stringify([{ title: "SDE role", content: "..." }]));
});

test("getLatestBenchmarkSnapshot returns parsed row", async () => {
  const rawRow = {
    generated_at: new Date("2026-06-22T00:00:00.000Z"),
    queries: JSON.stringify(["SDE backend roles"]),
    skill_frequency: JSON.stringify({ typescript: 3 }),
    missing_skills: JSON.stringify(["react"]),
    resume_keyword_gaps: JSON.stringify(["Add React experience"]),
    weekly_learning_priorities: JSON.stringify(["react"]),
    raw_results: JSON.stringify([{ title: "test" }]),
  };

  const { sql } = recordingSql([rawRow]);
  const snapshot = await getLatestBenchmarkSnapshot(sql);

  assert.ok(snapshot);
  assert.equal(snapshot.generatedAt, "2026-06-22T00:00:00.000Z");
  assert.deepEqual(snapshot.queries, ["SDE backend roles"]);
  assert.deepEqual(snapshot.skillFrequency, { typescript: 3 });
  assert.deepEqual(snapshot.missingSkills, ["react"]);
  assert.deepEqual(snapshot.resumeKeywordGaps, ["Add React experience"]);
  assert.deepEqual(snapshot.weeklyLearningPriorities, ["react"]);
  assert.deepEqual(snapshot.rawResults, [{ title: "test" }]);
});

test("getLatestBenchmarkSnapshot handles empty result set", async () => {
  const { sql } = recordingSql([]);
  const snapshot = await getLatestBenchmarkSnapshot(sql);

  assert.equal(snapshot, undefined);
});

test("getRecentBenchmarkSnapshots returns snapshots in correct order", async () => {
  const rawRows = [
    {
      generated_at: new Date("2026-06-24T00:00:00.000Z"),
      queries: JSON.stringify(["query 3"]),
      skill_frequency: JSON.stringify({}),
      missing_skills: JSON.stringify([]),
      resume_keyword_gaps: JSON.stringify([]),
      weekly_learning_priorities: JSON.stringify([]),
      raw_results: JSON.stringify([]),
    },
    {
      generated_at: new Date("2026-06-23T00:00:00.000Z"),
      queries: JSON.stringify(["query 2"]),
      skill_frequency: JSON.stringify({}),
      missing_skills: JSON.stringify([]),
      resume_keyword_gaps: JSON.stringify([]),
      weekly_learning_priorities: JSON.stringify([]),
      raw_results: JSON.stringify([]),
    },
  ];

  const { calls, sql } = recordingSql(rawRows);
  const snapshots = await getRecentBenchmarkSnapshots(sql, 10);

  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0]?.generatedAt, "2026-06-24T00:00:00.000Z");
  assert.equal(snapshots[0]?.queries[0], "query 3");
  assert.equal(snapshots[1]?.generatedAt, "2026-06-23T00:00:00.000Z");

  const selectCall = requiredCall(calls, "from benchmark_snapshots");
  assert.match(selectCall.text.replace(/\s+/g, " ").trim(), /order by generated_at desc/);
  assert.equal(selectCall.values[0], 10);
});

test("getRecentBenchmarkSnapshots handles empty result set", async () => {
  const { sql } = recordingSql([]);
  const snapshots = await getRecentBenchmarkSnapshots(sql);

  assert.deepEqual(snapshots, []);
});

test("getRecentBenchmarkSnapshots clamps limit between 1 and 100", async () => {
  const { calls: smallCalls, sql: smallSql } = recordingSql([]);
  await getRecentBenchmarkSnapshots(smallSql, -5);

  const smallCall = requiredCall(smallCalls, "limit");
  assert.equal(smallCall.values[0], 1);

  const { calls: largeCalls, sql: largeSql } = recordingSql([]);
  await getRecentBenchmarkSnapshots(largeSql, 500);

  const largeCall = requiredCall(largeCalls, "limit");
  assert.equal(largeCall.values[0], 100);
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

  return { calls, sql };
}

function requiredCall(calls: SqlCall[], pattern: string) {
  const call = calls.find((candidate) => candidate.text.includes(pattern));
  assert.ok(call, `Expected SQL call containing "${pattern}".`);
  return call;
}
