import assert from "node:assert/strict";
import test from "node:test";
import { generateDailyPlan } from "../src/index.js";
import type { ScoreSnapshot } from "@repo/shared";

const snapshot: ScoreSnapshot = {
  overall: 35,
  generatedAt: "2026-06-22T00:00:00.000Z",
  breakdown: [
    {
      label: "Code Quality + Testing",
      score: 10,
      weight: 0.15,
      evidenceCount: 1,
      explanation: "Needs stronger tests.",
    },
    {
      label: "DevOps/Cloud",
      score: 20,
      weight: 0.1,
      evidenceCount: 1,
      explanation: "Needs deploy evidence.",
    },
    {
      label: "Backend/API/System Design",
      score: 25,
      weight: 0.2,
      evidenceCount: 1,
      explanation: "Needs backend proof.",
    },
    {
      label: "DSA",
      score: 80,
      weight: 0.2,
      evidenceCount: 3,
      explanation: "Enough for today.",
    },
  ],
};

test("generates daily plan tasks from weakest rubric lanes", () => {
  const plan = generateDailyPlan(snapshot, {
    date: "2026-06-22",
    urgentLinearTask: "Unblock production webhook issue.",
  });

  assert.equal(plan.date, "2026-06-22");
  assert.deepEqual(plan.tasks.map((task) => task.category), [
    "linear",
    "testing",
    "devops",
    "backend",
  ]);
  assert.equal(plan.targetMinutes, 175);
});

test("ignores blank urgent Linear tasks and clamps weak lane limits", () => {
  const plan = generateDailyPlan(snapshot, {
    date: "2026-06-22",
    maxWeakLaneTasks: -4,
    urgentLinearTask: " ",
  });

  assert.deepEqual(plan.tasks.map((task) => task.category), ["testing"]);
});
