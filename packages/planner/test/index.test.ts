import assert from "node:assert/strict";
import test from "node:test";
import { formatDailyPlanForSlack, generateDailyPlan } from "../src/index.js";
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
    "dsa",
    "backend",
    "system_design",
    "github",
    "ai_agent",
    "public_proof",
    "testing",
    "devops",
  ]);
  assert.equal(plan.targetMinutes, 355);
  assert.match(plan.tasks.find((task) => task.category === "dsa")?.title ?? "", /Arrays\/Hashing - Medium/);
  assert.match(plan.tasks.find((task) => task.category === "dsa")?.title ?? "", /Binary Search - Medium/);
  assert.match(plan.tasks.find((task) => task.category === "backend")?.title ?? "", /validation, pagination, and tests/);
  assert.match(plan.tasks.find((task) => task.category === "system_design")?.title ?? "", /Redis token bucket/);
  assert.match(plan.tasks.find((task) => task.category === "github")?.title ?? "", /architecture diagram/);
  assert.match(plan.tasks.find((task) => task.category === "ai_agent")?.title ?? "", /manually verify/);
  assert.match(plan.tasks.find((task) => task.category === "public_proof")?.title ?? "", /Minimum non-zero day/);
});

test("ignores blank urgent Linear tasks and clamps weak lane limits", () => {
  const plan = generateDailyPlan(snapshot, {
    date: "2026-06-22",
    includeDailyEssentials: false,
    maxWeakLaneTasks: -4,
    urgentLinearTask: " ",
  });

  assert.deepEqual(plan.tasks.map((task) => task.category), ["testing"]);
});

test("formats Slack message with greeting, target time, and SDE switch plan", () => {
  const plan = generateDailyPlan(snapshot, {
    date: "2026-06-22",
    maxWeakLaneTasks: 1,
  });
  const slackText = formatDailyPlanForSlack(plan);

  assert.match(slackText, /^Good morning\./);
  assert.match(slackText, /Today's SDE Switch Plan/);
  assert.match(slackText, /Target time: \d+ min/);
  assert.match(slackText, /Minimum non-zero day: complete one 15-minute evidence-backed task\./);
  assert.match(slackText, /DSA: solve Arrays\/Hashing - Medium and Binary Search - Medium/);
  assert.match(slackText, /Backend: build one endpoint with validation, pagination, and tests/);
  assert.match(slackText, /AI-agent: use Hermes\/Codex\/Claude to generate tests/);
});
