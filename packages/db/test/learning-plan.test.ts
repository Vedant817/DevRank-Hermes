import assert from "node:assert/strict";
import test from "node:test";
import { buildLearningPlanDashboard, dailyTaskKey, type DailyTaskRecord } from "../src/index.js";

const dailyPlan = {
  date: "2026-06-23",
  targetMinutes: 225,
  tasks: [
    {
      title: "DSA: solve Arrays/Hashing - Medium and Binary Search - Medium.",
      category: "dsa" as const,
      minutes: 45,
      evidence: "Daily DSA target",
    },
    {
      title: "Backend: build one endpoint with validation, pagination, and tests.",
      category: "backend" as const,
      minutes: 60,
      evidence: "Daily backend target",
    },
    {
      title: "System design: revise rate limiter tradeoffs.",
      category: "system_design" as const,
      minutes: 45,
      evidence: "Daily system design target",
    },
    {
      title: "GitHub/portfolio: improve one repo README.",
      category: "github" as const,
      minutes: 45,
      evidence: "Daily portfolio target",
    },
    {
      title: "AI-agent: generate tests, then manually verify changes.",
      category: "ai_agent" as const,
      minutes: 30,
      evidence: "Daily AI-agent target",
    },
  ],
};

test("builds learning plan dashboard from persisted task status rows", () => {
  const taskRows: DailyTaskRecord[] = dailyPlan.tasks.map((task, index) => ({
    planDate: dailyPlan.date,
    taskKey: dailyTaskKey(dailyPlan.date, task),
    category: task.category,
    title: task.title,
    minutes: task.minutes,
    status: index < 2 ? "completed" : "pending",
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T12:00:00.000Z",
    ...(index < 2 ? { completedAt: "2026-06-23T12:00:00.000Z" } : {}),
    evidence: task.evidence,
  }));
  const dashboard = buildLearningPlanDashboard({
    today: "2026-06-23",
    dailyPlan,
    weeklyPlan: {
      weekStart: "2026-06-22",
      weeklyGoal: "Improve backend and testing with one evidence-backed ship each day.",
      targetMinutes: 870,
      generatedAt: "2026-06-22T00:00:00.000Z",
      tasks: [
        {
          day: "Monday",
          category: "dsa",
          title: "Arrays/Hashing practice.",
          minutes: 45,
        },
      ],
    },
    taskRows,
    recentTasks: [
      ...taskRows,
      {
        planDate: "2026-06-22",
        taskKey: "0123456789abcdef",
        category: "backend",
        title: "Previous backend task.",
        minutes: 60,
        status: "completed",
        completedAt: "2026-06-22T12:00:00.000Z",
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T12:00:00.000Z",
      },
    ],
  });

  assert.equal(dashboard.completion.completedTasks, 2);
  assert.equal(dashboard.completion.totalTasks, 5);
  assert.equal(dashboard.completion.percent, 40);
  assert.equal(dashboard.streak.currentDays, 2);
  assert.equal(dashboard.streak.lastCompletedDate, "2026-06-23");
  assert.equal(dashboard.dailyPlan?.freshness, "current");
  assert.equal(dashboard.weeklyPlan?.freshness, "current");
  assert.equal(dashboard.focus.dsa[0]?.title, dailyPlan.tasks[0]?.title);
  assert.equal(dashboard.focus.backend[0]?.status, "completed");
  assert.equal(dashboard.focus.systemDesign.length, 1);
  assert.equal(dashboard.focus.githubPortfolio.length, 1);
  assert.equal(dashboard.focus.aiAgent.length, 1);
});

test("falls back to daily plan JSON when task rows have not been materialized yet", () => {
  const dashboard = buildLearningPlanDashboard({
    today: "2026-06-24",
    dailyPlan,
    recentTasks: [],
  });

  assert.equal(dashboard.dailyPlan?.freshness, "stale");
  assert.equal(dashboard.tasks.length, dailyPlan.tasks.length);
  assert.deepEqual(dashboard.tasks.map((task) => task.status), [
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
  ]);
  assert.equal(dashboard.completion.statusLabel, "0/5 completed");
  assert.equal(dashboard.streak.currentDays, 0);
});

test("streak survives a pending today when yesterday was completed", () => {
  const dashboard = buildLearningPlanDashboard({
    today: "2026-06-24",
    recentTasks: [
      {
        planDate: "2026-06-23",
        taskKey: "0123456789abcdef",
        category: "backend",
        title: "Yesterday backend task.",
        minutes: 60,
        status: "completed",
        completedAt: "2026-06-23T12:00:00.000Z",
        createdAt: "2026-06-23T00:00:00.000Z",
        updatedAt: "2026-06-23T12:00:00.000Z",
      },
      {
        planDate: "2026-06-22",
        taskKey: "fedcba9876543210",
        category: "dsa",
        title: "Day-before task.",
        minutes: 45,
        status: "completed",
        completedAt: "2026-06-22T12:00:00.000Z",
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T12:00:00.000Z",
      },
    ],
  });

  assert.equal(dashboard.streak.currentDays, 2);
  assert.equal(dashboard.streak.lastCompletedDate, "2026-06-23");
});

test("streak resets after two missed days", () => {
  const dashboard = buildLearningPlanDashboard({
    today: "2026-06-25",
    recentTasks: [
      {
        planDate: "2026-06-23",
        taskKey: "0123456789abcdef",
        category: "backend",
        title: "Old backend task.",
        minutes: 60,
        status: "completed",
        completedAt: "2026-06-23T12:00:00.000Z",
        createdAt: "2026-06-23T00:00:00.000Z",
        updatedAt: "2026-06-23T12:00:00.000Z",
      },
    ],
  });

  assert.equal(dashboard.streak.currentDays, 0);
});
