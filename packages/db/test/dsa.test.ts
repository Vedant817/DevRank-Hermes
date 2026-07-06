import assert from "node:assert/strict";
import test from "node:test";
import { toDsaQuestion } from "../src/dsa.js";

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
