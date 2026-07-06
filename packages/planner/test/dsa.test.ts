import assert from "node:assert/strict";
import test from "node:test";
import type { DsaQuestion } from "@repo/shared";
import { selectDailyDsaTargets } from "../src/dsa.js";

const bank: DsaQuestion[] = [
  q("two-sum", "Arrays/Hashing", "easy"),
  q("group-anagrams", "Arrays/Hashing", "medium"),
  q("longest-consecutive-sequence", "Arrays/Hashing", "medium"),
  q("first-missing-positive", "Arrays/Hashing", "hard"),
  q("binary-search", "Binary Search/Two Pointers", "easy"),
  q("search-in-rotated-sorted-array", "Binary Search/Two Pointers", "medium"),
  q("climbing-stairs", "Dynamic Programming", "easy"),
  q("edit-distance", "Dynamic Programming", "hard"),
];

function q(slug: string, topic: string, difficulty: DsaQuestion["difficulty"]): DsaQuestion {
  return { slug, title: slug, topic, difficulty, url: `https://leetcode.com/problems/${slug}/`, patterns: [] };
}

test("returns no targets when the question bank is empty", () => {
  assert.deepEqual(selectDailyDsaTargets([], { date: "2026-06-22" }), []);
});

test("selects the weekday topic (Monday -> Arrays/Hashing) and default count of two", () => {
  const targets = selectDailyDsaTargets(bank, { date: "2026-06-22" });

  assert.equal(targets.length, 2);
  assert.ok(targets.every((target) => target.topic === "Arrays/Hashing"));
});

test("rotates the weekday topic across the ladder (Tuesday -> Binary Search/Two Pointers)", () => {
  const targets = selectDailyDsaTargets(bank, { date: "2026-06-23" });

  assert.ok(targets.every((target) => target.topic === "Binary Search/Two Pointers"));
});

test("escalates difficulty preference with a strong DSA lane score", () => {
  const strong = selectDailyDsaTargets(bank, { date: "2026-06-22", dsaLaneScore: 90 });
  const weak = selectDailyDsaTargets(bank, { date: "2026-06-22", dsaLaneScore: 10 });

  assert.equal(strong[0]?.difficulty, "hard");
  assert.equal(weak[0]?.difficulty, "easy");
});

test("is deterministic for the same date and rotates specific questions across dates", () => {
  const first = selectDailyDsaTargets(bank, { date: "2026-06-22", dsaLaneScore: 50 });
  const firstAgain = selectDailyDsaTargets(bank, { date: "2026-06-22", dsaLaneScore: 50 });

  assert.deepEqual(first.map((target) => target.slug), firstAgain.map((target) => target.slug));

  // The two medium Arrays/Hashing questions rotate depending on the date offset.
  const mondayMedium = selectDailyDsaTargets(bank, { date: "2026-06-22", dsaLaneScore: 50 })[0]?.slug;
  const nextMondayMedium = selectDailyDsaTargets(bank, { date: "2026-06-29", dsaLaneScore: 50 })[0]?.slug;

  assert.equal(mondayMedium, "group-anagrams");
  assert.equal(nextMondayMedium, "longest-consecutive-sequence");
});

test("falls back to the full bank when the weekday topic is missing", () => {
  const single: DsaQuestion[] = [q("coin-change", "Dynamic Programming", "medium")];
  // Wednesday maps to Stack/Queue/Linked List, which is absent here.
  const targets = selectDailyDsaTargets(single, { date: "2026-06-24" });

  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.slug, "coin-change");
});
