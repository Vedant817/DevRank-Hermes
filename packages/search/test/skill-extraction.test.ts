import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreSkillFrequency,
  computeSkillGap,
  skillTaxonomy,
  MISSING_SKILL_FREQUENCY_THRESHOLD,
  MAX_WEEKLY_LEARNING_PRIORITIES,
} from "../src/skill-extraction.js";
import type { SearchResult } from "../src/index.js";

test("scoreSkillFrequency returns empty frequency for empty results", () => {
  const frequency = scoreSkillFrequency([]);

  assert.deepEqual(frequency, {});
});

test("scoreSkillFrequency detects skills from search result text", () => {
  const results: SearchResult[] = [
    {
      title: "Senior Backend Engineer",
      url: "https://example.com/job1",
      content: "Looking for TypeScript and Node.js developers with PostgreSQL experience.",
    },
  ];

  const frequency = scoreSkillFrequency(results);

  assert.ok(frequency.typescript >= 1);
  assert.ok(frequency.nodejs >= 1);
  assert.ok(frequency.sql >= 1);
});

test("scoreSkillFrequency counts multiple keyword hits for the same skill", () => {
  const results: SearchResult[] = [
    { title: "React Developer", url: "", content: "React hooks React components and JSX testing" },
  ];

  const frequency = scoreSkillFrequency(results);

  assert.ok(frequency.react >= 2);
});

test("computeSkillGap returns empty gaps when no skills exceed threshold", () => {
  const result = computeSkillGap(
    { typescript: 1 },
    [],
  );

  assert.deepEqual(result.missingSkills, []);
  assert.deepEqual(result.resumeKeywordGaps, []);
  assert.deepEqual(result.weeklyLearningPriorities, []);
});

test("computeSkillGap identifies missing skills above threshold", () => {
  const result = computeSkillGap(
    { typescript: 3, nodejs: 2, react: 1 },
    [],
  );

  assert.ok(result.missingSkills.includes("typescript"));
  assert.ok(result.weeklyLearningPriorities.includes("typescript"));
  assert.ok(result.resumeKeywordGaps.some((gap) => gap.includes("TypeScript")));
});

test("computeSkillGap excludes owned skills from missing skills", () => {
  const result = computeSkillGap(
    { typescript: 3, nodejs: 4, react: 5 },
    ["typescript", "nodejs"],
  );

  assert.ok(!result.missingSkills.includes("typescript"));
  assert.ok(!result.missingSkills.includes("nodejs"));
  assert.ok(result.missingSkills.includes("react"));
});

test("computeSkillGap respects custom threshold", () => {
  const result = computeSkillGap(
    { typescript: 2, nodejs: 5 },
    [],
    { threshold: 5 },
  );

  assert.ok(!result.missingSkills.includes("typescript"));
  assert.ok(result.missingSkills.includes("nodejs"));
});

test("computeSkillGap limits weekly learning priorities", () => {
  const highFrequency: Record<string, number> = {};
  for (const entry of skillTaxonomy) {
    highFrequency[entry.slug] = 10;
  }

  const result = computeSkillGap(highFrequency, [], { maxPriorities: 3 });

  assert.equal(result.weeklyLearningPriorities.length, 3);
});

test("computeSkillGap sorts missing skills by frequency descending", () => {
  const result = computeSkillGap(
    { react: 5, typescript: 10, nodejs: 3 },
    [],
    { threshold: 1 },
  );

  assert.equal(result.missingSkills[0], "typescript");
  assert.equal(result.missingSkills[1], "react");
  assert.equal(result.missingSkills[2], "nodejs");
});

test("MISSING_SKILL_FREQUENCY_THRESHOLD is the default threshold", () => {
  const result = computeSkillGap(
    { typescript: MISSING_SKILL_FREQUENCY_THRESHOLD - 1 },
  );

  assert.deepEqual(result.missingSkills, []);
});

test("MAX_WEEKLY_LEARNING_PRIORITIES is the default max", () => {
  const highFrequency: Record<string, number> = {};
  for (const entry of skillTaxonomy) {
    highFrequency[entry.slug] = 10;
  }

  const result = computeSkillGap(highFrequency);

  assert.equal(result.weeklyLearningPriorities.length, MAX_WEEKLY_LEARNING_PRIORITIES);
});
