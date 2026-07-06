import assert from "node:assert/strict";
import test from "node:test";
import {
  aiAgentMaturityRubric,
  aiAgentMaturityRubricVersion,
  computeAiAgentMaturitySnapshot,
} from "../src/index.js";

const strongSession = {
  commandsRun: ["pnpm test", "pnpm lint"],
  errorsFaced: [],
  filesTouched: ["packages/db/src/schema.ts"],
  prompts: [
    "Plan the migration in steps: 1. add the table 2. register it in schema.ts 3. cover it with a schema test before running pnpm test.",
  ],
  repeatedMistakes: [],
  toolCalls: ["edit", "bash", "read"],
};

const weakSession = {
  commandsRun: [],
  errorsFaced: ["TypeError: cannot read properties of undefined"],
  filesTouched: [],
  prompts: ["fix it"],
  repeatedMistakes: ["typeerror cannot read properties repeated 2 times"],
  toolCalls: [],
};

test("maturity rubric matches the Task.md weight specification", () => {
  const weights = new Map(aiAgentMaturityRubric.map((lane) => [lane.label, lane.weight]));

  assert.equal(weights.get("Task Planning"), 0.25);
  assert.equal(weights.get("Prompt Quality"), 0.2);
  assert.equal(weights.get("Validation After AI Output"), 0.2);
  assert.equal(weights.get("Tool/Orchestrator Setup"), 0.15);
  assert.equal(weights.get("Reusable Skills Created"), 0.1);
  assert.equal(weights.get("Reduced Repeated Mistakes"), 0.1);
  assert.ok(
    Math.abs(aiAgentMaturityRubric.reduce((total, lane) => total + lane.weight, 0) - 1) < 0.000001,
  );
});

test("returns a zero snapshot when no session evidence exists", () => {
  const snapshot = computeAiAgentMaturitySnapshot({ reusableSkillCount: 0, sessions: [] });

  assert.equal(snapshot.overall, 0);
  assert.equal(snapshot.rubricVersion, aiAgentMaturityRubricVersion);
  assert.equal(snapshot.breakdown.length, aiAgentMaturityRubric.length);
  assert.ok(snapshot.breakdown.every((lane) => lane.score === 0));
});

test("scores planned, validated, tool-driven sessions far above unvalidated ones", () => {
  const strong = computeAiAgentMaturitySnapshot({
    reusableSkillCount: 3,
    sessions: [strongSession, strongSession],
  });
  const weak = computeAiAgentMaturitySnapshot({
    reusableSkillCount: 0,
    sessions: [weakSession, weakSession],
  });

  assert.ok(strong.overall >= 85, `expected strong overall >= 85, got ${strong.overall}`);
  assert.ok(weak.overall <= 25, `expected weak overall <= 25, got ${weak.overall}`);

  const strongValidation = strong.breakdown.find((lane) => lane.label === "Validation After AI Output");
  const weakValidation = weak.breakdown.find((lane) => lane.label === "Validation After AI Output");

  assert.equal(strongValidation?.score, 100);
  assert.equal(weakValidation?.score, 0);
});

test("repeated mistakes lower only the reduced-repeated-mistakes lane", () => {
  const clean = computeAiAgentMaturitySnapshot({
    reusableSkillCount: 1,
    sessions: [strongSession],
  });
  const repeating = computeAiAgentMaturitySnapshot({
    reusableSkillCount: 1,
    sessions: [{ ...strongSession, repeatedMistakes: ["same lint failure repeated 3 times"] }],
  });

  const cleanLane = clean.breakdown.find((lane) => lane.label === "Reduced Repeated Mistakes");
  const repeatingLane = repeating.breakdown.find((lane) => lane.label === "Reduced Repeated Mistakes");

  assert.equal(cleanLane?.score, 100);
  assert.equal(repeatingLane?.score, 0);
  assert.ok(repeating.overall < clean.overall);

  for (const label of ["Task Planning", "Prompt Quality", "Validation After AI Output"]) {
    assert.equal(
      clean.breakdown.find((lane) => lane.label === label)?.score,
      repeating.breakdown.find((lane) => lane.label === label)?.score,
    );
  }
});

test("every lane explains its score with evidence counts", () => {
  const snapshot = computeAiAgentMaturitySnapshot({
    reusableSkillCount: 2,
    sessions: [strongSession, weakSession],
  });

  for (const lane of snapshot.breakdown) {
    assert.ok(lane.explanation.length > 0, `${lane.label} has no explanation`);
    assert.ok(Number.isFinite(lane.evidenceCount));
  }
});
