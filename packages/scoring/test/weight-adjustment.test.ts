import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMarketWeightAdjustment,
  deriveRubricVersion,
  MAX_RUBRIC_DRIFT_PCT,
} from "../src/weight-adjustment.js";
import {
  sdeReadinessRubric,
  sdeReadinessRubricVersion,
} from "../src/rubrics.js";
import { isCurrentSdeReadinessSnapshot } from "../src/index.js";
import type { MarketBenchmark } from "@repo/search";

const baseWeightSum = sdeReadinessRubric.reduce((sum, lane) => sum + lane.weight, 0);

test("weight adjustment produces different weights from base", () => {
  const benchmark: MarketBenchmark = {
    generatedAt: "2026-06-22T00:00:00.000Z",
    queries: ["backend SDE roles"],
    repeatedSkills: [],
    results: [],
    skillFrequency: { testing: 10, react: 8 },
    missingSkills: ["testing", "react"],
    resumeKeywordGaps: [],
    weeklyLearningPriorities: [],
  };

  const adjusted = applyMarketWeightAdjustment(sdeReadinessRubric, benchmark);
  const baseLabels = new Map(sdeReadinessRubric.map((lane) => [lane.label, lane.weight]));

  const changed = adjusted.filter((lane) => {
    const baseWeight = baseLabels.get(lane.label);
    return baseWeight !== undefined && Math.abs(lane.weight - baseWeight) > 0.000001;
  });

  assert.ok(changed.length > 0, "Expected at least one lane weight to change after adjustment");
});

test("version string is hash-suffixed for adjusted rubrics", () => {
  const benchmark: MarketBenchmark = {
    generatedAt: "2026-06-22T00:00:00.000Z",
    queries: ["backend SDE roles"],
    repeatedSkills: [],
    results: [],
    skillFrequency: { testing: 5 },
    missingSkills: ["testing"],
    resumeKeywordGaps: [],
    weeklyLearningPriorities: [],
  };

  const adjusted = applyMarketWeightAdjustment(sdeReadinessRubric, benchmark);
  const version = deriveRubricVersion(sdeReadinessRubric, adjusted);

  assert.match(version, /^sde-readiness-v2-[a-f0-9]{8}$/);
});

test("deriveRubricVersion returns base version when rubrics are equal", () => {
  const version = deriveRubricVersion(sdeReadinessRubric, sdeReadinessRubric);

  assert.equal(version, sdeReadinessRubricVersion);
});

test("isCurrentSdeReadinessSnapshot returns true for hash-suffixed adjusted snapshot", () => {
  const benchmark: MarketBenchmark = {
    generatedAt: "2026-06-22T00:00:00.000Z",
    queries: ["backend SDE roles"],
    repeatedSkills: [],
    results: [],
    skillFrequency: { testing: 5 },
    missingSkills: ["testing"],
    resumeKeywordGaps: [],
    weeklyLearningPriorities: [],
  };

  const adjusted = applyMarketWeightAdjustment(sdeReadinessRubric, benchmark);
  const version = deriveRubricVersion(sdeReadinessRubric, adjusted);

  const snapshot = {
    overall: 50,
    generatedAt: "2026-06-22T00:00:00.000Z",
    rubricVersion: version,
    breakdown: adjusted.map((lane) => ({
      label: lane.label,
      score: 50,
      weight: lane.weight,
      evidenceCount: 1,
      explanation: "Test evidence.",
    })),
  };

  const result = isCurrentSdeReadinessSnapshot(snapshot);

  assert.equal(result, true,
    "A hash-suffixed snapshot whose breakdown weights match the adjusted rubric should be considered current");
});

test("out-of-drift bounds weights are clamped", () => {
  const extreme = sdeReadinessRubric.map((lane) => ({
    ...lane,
    weight: lane.weight * 10,
  }));

  const benchmark: MarketBenchmark = {
    generatedAt: "2026-06-22T00:00:00.000Z",
    queries: ["test"],
    repeatedSkills: [],
    results: [],
    skillFrequency: { testing: 100, react: 100 },
    missingSkills: ["testing", "react"],
    resumeKeywordGaps: [],
    weeklyLearningPriorities: [],
  };

  const adjusted = applyMarketWeightAdjustment(extreme, benchmark, { maxDriftPct: 0.15 });

  for (const lane of adjusted) {
    const baseLane = extreme.find((l) => l.label === lane.label);
    assert.ok(baseLane);
    const drift = Math.abs(lane.weight - baseLane.weight) / baseLane.weight;
    assert.ok(drift <= MAX_RUBRIC_DRIFT_PCT + 0.001,
      `Lane "${lane.label}" weight drift ${drift} exceeds max ${MAX_RUBRIC_DRIFT_PCT}`);
  }
});

test("renormalization preserves total weight sum", () => {
  const benchmark: MarketBenchmark = {
    generatedAt: "2026-06-22T00:00:00.000Z",
    queries: ["backend SDE roles"],
    repeatedSkills: [],
    results: [],
    skillFrequency: { testing: 5, react: 4 },
    missingSkills: ["testing", "react"],
    resumeKeywordGaps: [],
    weeklyLearningPriorities: [],
  };

  const adjusted = applyMarketWeightAdjustment(sdeReadinessRubric, benchmark);
  const adjustedSum = adjusted.reduce((sum, lane) => sum + lane.weight, 0);

  assert.ok(Math.abs(adjustedSum - baseWeightSum) < 0.001,
    `Total weight sum ${adjustedSum} differs from base ${baseWeightSum}`);
});

test("adjustment with no missing skills returns base weights unchanged", () => {
  const benchmark: MarketBenchmark = {
    generatedAt: "2026-06-22T00:00:00.000Z",
    queries: ["test"],
    repeatedSkills: [],
    results: [],
    skillFrequency: {},
    missingSkills: [],
    resumeKeywordGaps: [],
    weeklyLearningPriorities: [],
  };

  const adjusted = applyMarketWeightAdjustment(sdeReadinessRubric, benchmark);

  for (const lane of adjusted) {
    const baseLane = sdeReadinessRubric.find((l) => l.label === lane.label);
    assert.ok(baseLane);
    assert.equal(lane.weight, baseLane.weight);
  }
});
