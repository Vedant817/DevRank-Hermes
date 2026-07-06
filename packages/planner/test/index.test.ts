import assert from "node:assert/strict";
import test from "node:test";
import { formatDailyPlanForSlack, generateDailyPlan, generateWeeklyPlan } from "../src/index.js";
import type { DsaQuestion, ScoreSnapshot } from "@repo/shared";

const snapshot: ScoreSnapshot = {
  overall: 35,
  generatedAt: "2026-06-22T00:00:00.000Z",
  rubricVersion: "sde-readiness-v2",
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
      label: "Backend/API",
      score: 25,
      weight: 0.15,
      evidenceCount: 1,
      explanation: "Needs backend proof.",
    },
    {
      label: "Frontend/UI",
      score: 30,
      weight: 0.05,
      evidenceCount: 1,
      explanation: "Needs frontend proof.",
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
    maxWeakLaneTasks: 4,
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
    "frontend",
  ]);
  assert.equal(plan.targetMinutes, 400);
  assert.match(plan.tasks.find((task) => task.category === "dsa")?.title ?? "", /harder DSA problem/);
  assert.match(plan.tasks.find((task) => task.category === "backend")?.title ?? "", /validation, pagination, and tests/);
  assert.match(plan.tasks.find((task) => task.category === "system_design")?.title ?? "", /Establish system-design evidence/);
  assert.match(plan.tasks.find((task) => task.category === "frontend")?.title ?? "", /accessible states/);
  assert.match(plan.tasks.find((task) => task.category === "github")?.title ?? "", /Establish portfolio evidence/);
  assert.match(plan.tasks.find((task) => task.category === "ai_agent")?.title ?? "", /Establish AI-agent evidence/);
  assert.match(plan.tasks.find((task) => task.category === "public_proof")?.title ?? "", /Establish public proof/);
  assert.equal(plan.tasks.find((task) => task.category === "public_proof")?.minutes, 15);
  assert.equal(
    plan.tasks.find((task) => task.category === "backend")?.evidence,
    "Backend/API: 25% from 1 evidence item",
  );
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

test("injects concrete DSA questions into the daily plan when a question bank is provided", () => {
  const dsaQuestionBank: DsaQuestion[] = [
    {
      slug: "two-sum",
      title: "Two Sum",
      topic: "Arrays/Hashing",
      difficulty: "easy",
      url: "https://leetcode.com/problems/two-sum/",
      patterns: ["hash map"],
    },
    {
      slug: "first-missing-positive",
      title: "First Missing Positive",
      topic: "Arrays/Hashing",
      difficulty: "hard",
      url: "https://leetcode.com/problems/first-missing-positive/",
      patterns: ["index as hash"],
    },
  ];
  const plan = generateDailyPlan(snapshot, {
    date: "2026-06-22",
    dsaQuestionBank,
    maxWeakLaneTasks: 1,
  });
  const dsaTask = plan.tasks.find((task) => task.category === "dsa");

  // Snapshot DSA score is 80, so the hard Arrays/Hashing question leads.
  assert.match(dsaTask?.title ?? "", /Solve 2 DSA question\(s\)/);
  assert.match(dsaTask?.title ?? "", /First Missing Positive \(Arrays\/Hashing, hard\)/);
  assert.match(dsaTask?.title ?? "", /Two Sum \(Arrays\/Hashing, easy\)/);
  assert.match(dsaTask?.evidence ?? "", /leetcode\.com\/problems\/first-missing-positive/);
});

test("leaves the DSA task generic when no question bank is provided", () => {
  const plan = generateDailyPlan(snapshot, { date: "2026-06-22", maxWeakLaneTasks: 1 });
  const dsaTask = plan.tasks.find((task) => task.category === "dsa");

  assert.doesNotMatch(dsaTask?.title ?? "", /Solve 2 DSA question\(s\)/);
});

test("surfaces Linear sync failures as visible daily plan work", () => {
  const plan = generateDailyPlan(snapshot, {
    date: "2026-06-22",
    includeDailyEssentials: false,
    linearSyncWarning: "Latest Linear sync failed. Fix Linear backfill before relying on project planning.",
    maxWeakLaneTasks: 1,
    urgentLinearTask: "Linear DEV-12: Unblock webhook ingestion.",
  });
  const linearTask = plan.tasks.find((task) => task.category === "linear");

  assert.equal(linearTask?.minutes, 35);
  assert.match(linearTask?.title ?? "", /Latest Linear sync failed/);
  assert.match(linearTask?.title ?? "", /Linear DEV-12/);
  assert.equal(linearTask?.evidence, "Linear sync health; Linear priority");
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
  assert.match(slackText, /harder DSA problem under time constraints/);
  assert.match(slackText, /Build or improve one API endpoint with validation, pagination, and tests/);
  assert.match(slackText, /Establish AI-agent evidence/);
  assert.match(slackText, /Backend\/API: 25% from 1 evidence item/);
});

test("adapts the weekly ladder to persisted weak-lane evidence", () => {
  const plan = generateWeeklyPlan(snapshot, {
    generatedAt: "2026-06-24T10:00:00.000Z",
    maxWeakLaneTasks: 3,
  });

  assert.equal(plan.weekStart, "2026-06-22");
  assert.equal(plan.generatedAt, "2026-06-24T10:00:00.000Z");
  assert.match(plan.weeklyGoal, /Code Quality \+ Testing/);
  assert.equal(plan.tasks.length, 15);
  assert.equal(plan.targetMinutes, 870);
  assert.deepEqual(plan.tasks.slice(0, 2).map((task) => task.day), ["Monday", "Monday"]);
  assert.match(plan.tasks[0]?.title ?? "", /Arrays\/Hashing/);
  assert.match(plan.tasks[1]?.title ?? "", /Backend API/);
  assert.match(plan.tasks[1]?.title ?? "", /beyond the 1 existing evidence item/);
  assert.match(plan.tasks[1]?.evidence ?? "", /Backend\/API: 25% from 1 evidence item/);
  assert.match(plan.tasks.find((task) => task.day === "Sunday" && task.category === "public_proof")?.title ?? "", /resume, LinkedIn, X/);
});
