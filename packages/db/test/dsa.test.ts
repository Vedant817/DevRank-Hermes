import assert from "node:assert/strict";
import test from "node:test";
import { listDsaCompletions, toDsaQuestion } from "../src/dsa.js";
import { getDsaQuestionBySlug } from "../src/repositories.js";

test("maps a persisted DSA row into a typed question", () => {
  const question = toDsaQuestion({
    difficulty: "Medium",
    patterns: ["bfs", "dfs"],
    slug: "number-of-islands",
    title: "Number of Islands",
    topic: "Trees/Graphs",
    url: "https://leetcode.com/problems/number-of-islands/",
  });

  assert.equal(question.slug, "number-of-islands");
  assert.equal(question.topic, "Trees/Graphs");
  assert.equal(question.difficulty, "medium");
  assert.deepEqual(question.patterns, ["bfs", "dfs"]);
});

test("normalizes unexpected difficulty values and null patterns defensively", () => {
  const question = toDsaQuestion({
    difficulty: "impossible",
    patterns: null,
    slug: "mystery",
    title: "Mystery Problem",
    topic: "Arrays/Hashing",
    url: "https://leetcode.com/problems/mystery/",
  });

  assert.equal(question.difficulty, "medium");
  assert.deepEqual(question.patterns, []);
});

function mockSqlClient(rows: unknown[]): Parameters<typeof getDsaQuestionBySlug>[0] {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    return Promise.resolve(rows);
  }) as unknown as ReturnType<typeof mockSqlClient>;

  return sql;
}

test("getDsaQuestionBySlug returns a question for a matching slug", async () => {
  const rows = [{
    slug: "two-sum",
    title: "Two Sum",
    topic: "Arrays/Hashing",
    difficulty: "Easy",
    url: "https://leetcode.com/problems/two-sum/",
    patterns: ["array", "hash-table"],
  }];
  const sql = mockSqlClient(rows);
  const question = await getDsaQuestionBySlug(sql, "two-sum");

  assert.ok(question);
  assert.equal(question?.slug, "two-sum");
  assert.equal(question?.title, "Two Sum");
  assert.equal(question?.topic, "Arrays/Hashing");
  assert.equal(question?.difficulty, "Easy");
  assert.equal(question?.url, "https://leetcode.com/problems/two-sum/");
  assert.deepEqual(question?.patterns, ["array", "hash-table"]);
});

test("getDsaQuestionBySlug returns undefined for a non-existent slug", async () => {
  const sql = mockSqlClient([]);
  const question = await getDsaQuestionBySlug(sql, "non-existent-slug");

  assert.equal(question, undefined);
});

test("listDsaCompletions maps evidence dates and rejects malformed dates", async () => {
  const sql = mockSqlClient([
    { slug: "two-sum", metadata_date: "2026-09-08", occurred_at: null, created_at: "2026-09-08T12:00:00.000Z" },
    { slug: "number-of-islands", metadata_date: null, occurred_at: "2026-09-07T12:00:00.000Z", created_at: "2026-09-07T12:00:00.000Z" },
    { slug: "fallback", metadata_date: null, occurred_at: null, created_at: new Date("2026-09-06T23:30:00.000Z") },
    { slug: "duplicate", metadata_date: "2026-09-05", occurred_at: null, created_at: "2026-09-05T12:00:00.000Z" },
    { slug: "duplicate", metadata_date: "2026-09-05", occurred_at: null, created_at: "2026-09-05T13:00:00.000Z" },
    { slug: "impossible", metadata_date: "2026-02-31", occurred_at: null, created_at: "2026-09-04T12:00:00.000Z" },
    { slug: "suffixed", metadata_date: "2026-09-03junk", occurred_at: null, created_at: "2026-09-03T12:00:00.000Z" },
    { slug: "bad-occurred", metadata_date: null, occurred_at: "2026-09-02junk", created_at: "2026-09-02T12:00:00.000Z" },
    { slug: "year-zero", metadata_date: "0000-01-01", occurred_at: null, created_at: "2026-09-01T12:00:00.000Z" },
  ]);

  assert.deepEqual(await listDsaCompletions(sql), [
    { slug: "two-sum", date: "2026-09-08" },
    { slug: "number-of-islands", date: "2026-09-07" },
    { slug: "fallback", date: "2026-09-06" },
    { slug: "duplicate", date: "2026-09-05" },
  ]);
});
