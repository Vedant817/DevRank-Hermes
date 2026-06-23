import type { DailyPlan, WeeklyPlan } from "@repo/shared";
import type { SqlClient } from "./client.js";
import {
  dailyTaskFromRow,
  dailyTaskKey,
  type DailyTaskRecord,
  type DailyTaskRow,
  type DailyTaskStatus,
  weeklyPlanFromRow,
  type WeeklyPlanRow,
} from "./repositories.js";

type DailyPlanRow = {
  plan_date: Date | string;
  target_minutes: number;
  tasks: DailyPlan["tasks"] | string;
  created_at: Date | string;
};

type PlanFreshness = "current" | "stale";

export interface LearningPlanDashboard {
  today: string;
  completion: {
    completedTasks: number;
    percent: number;
    statusLabel: string;
    totalTasks: number;
  };
  dailyPlan?: DailyPlan & {
    createdAt: string;
    freshness: PlanFreshness;
  };
  focus: {
    aiAgent: DailyTaskRecord[];
    backend: DailyTaskRecord[];
    dsa: DailyTaskRecord[];
    githubPortfolio: DailyTaskRecord[];
    systemDesign: DailyTaskRecord[];
  };
  recentCompletedDates: string[];
  streak: {
    currentDays: number;
    lastCompletedDate?: string;
  };
  tasks: DailyTaskRecord[];
  weeklyPlan?: WeeklyPlan & {
    createdAt: string;
    freshness: PlanFreshness;
  };
}

export interface BuildLearningPlanDashboardInput {
  dailyPlan?: DailyPlan & { createdAt?: string };
  recentTasks?: DailyTaskRecord[];
  taskRows?: DailyTaskRecord[];
  today: string;
  weeklyPlan?: WeeklyPlan & { createdAt?: string };
}

export async function getLearningPlanDashboard(
  sql: SqlClient,
  options: { today?: string } = {},
): Promise<LearningPlanDashboard> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const [dailyPlanRows, weeklyPlanRows, recentTaskRows] = await Promise.all([
    sql<DailyPlanRow[]>`
      select plan_date, tasks, target_minutes, created_at
      from daily_plans
      where plan_date <= ${today}
      order by plan_date desc, created_at desc
      limit 1
    `,
    sql<WeeklyPlanRow[]>`
      select week_start, weekly_goal, tasks, target_minutes, generated_at, created_at
      from weekly_plans
      where week_start <= ${today}
      order by week_start desc, created_at desc
      limit 1
    `,
    sql<DailyTaskRow[]>`
      select
        plan_date,
        task_key,
        category,
        title,
        minutes,
        evidence,
        status,
        completed_at,
        notes,
        evidence_url,
        created_at,
        updated_at
      from daily_tasks
      where plan_date <= ${today}
        and plan_date >= (${today}::date - interval '60 days')
      order by plan_date desc, created_at asc
    `,
  ]);
  const dailyPlan = dailyPlanRows[0] ? dailyPlanFromRow(dailyPlanRows[0]) : undefined;
  const taskRows = dailyPlan
    ? await listDailyTaskRows(sql, dailyPlan.date)
    : [];

  return buildLearningPlanDashboard({
    today,
    dailyPlan,
    weeklyPlan: weeklyPlanRows[0] ? weeklyPlanFromRow(weeklyPlanRows[0]) : undefined,
    taskRows: taskRows.map(dailyTaskFromRow),
    recentTasks: recentTaskRows.map(dailyTaskFromRow),
  });
}

export function buildLearningPlanDashboard(
  input: BuildLearningPlanDashboardInput,
): LearningPlanDashboard {
  const tasks = normalizeDailyTasks(input);
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const totalTasks = tasks.length;
  const completionPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const completedDates = completedDateSet([
    ...(input.recentTasks ?? []),
    ...tasks,
  ]);
  const recentCompletedDates = [...completedDates].sort().reverse();
  const lastCompletedDate = recentCompletedDates[0];

  return {
    today: input.today,
    completion: {
      completedTasks,
      percent: completionPercent,
      statusLabel: completionStatusLabel(completedTasks, totalTasks),
      totalTasks,
    },
    ...(input.dailyPlan ? {
      dailyPlan: {
        ...input.dailyPlan,
        createdAt: input.dailyPlan.createdAt ?? `${input.dailyPlan.date}T00:00:00.000Z`,
        freshness: input.dailyPlan.date === input.today ? "current" : "stale",
      },
    } : {}),
    focus: {
      dsa: tasks.filter((task) => task.category === "dsa"),
      backend: tasks.filter((task) => task.category === "backend"),
      systemDesign: tasks.filter((task) => task.category === "system_design"),
      githubPortfolio: tasks.filter((task) => task.category === "github"),
      aiAgent: tasks.filter((task) => task.category === "ai_agent"),
    },
    recentCompletedDates,
    streak: {
      currentDays: currentStreak(completedDates, input.today),
      ...(lastCompletedDate ? { lastCompletedDate } : {}),
    },
    tasks,
    ...(input.weeklyPlan ? {
      weeklyPlan: {
        ...input.weeklyPlan,
        createdAt: input.weeklyPlan.createdAt ?? input.weeklyPlan.generatedAt,
        freshness: isDateInWeek(input.today, input.weeklyPlan.weekStart) ? "current" : "stale",
      },
    } : {}),
  };
}

async function listDailyTaskRows(sql: SqlClient, planDate: string): Promise<DailyTaskRow[]> {
  return sql<DailyTaskRow[]>`
    select
      plan_date,
      task_key,
      category,
      title,
      minutes,
      evidence,
      status,
      completed_at,
      notes,
      evidence_url,
      created_at,
      updated_at
    from daily_tasks
    where plan_date = ${planDate}
    order by created_at asc, title asc
  `;
}

function normalizeDailyTasks(input: BuildLearningPlanDashboardInput): DailyTaskRecord[] {
  if (input.taskRows && input.taskRows.length > 0) {
    return input.taskRows;
  }

  if (!input.dailyPlan) {
    return [];
  }

  const createdAt = input.dailyPlan.createdAt ?? `${input.dailyPlan.date}T00:00:00.000Z`;

  return input.dailyPlan.tasks.map((task) => ({
    planDate: input.dailyPlan?.date ?? input.today,
    taskKey: dailyTaskKey(input.dailyPlan?.date ?? input.today, task),
    category: task.category,
    title: task.title,
    minutes: task.minutes,
    status: "pending" as DailyTaskStatus,
    createdAt,
    updatedAt: createdAt,
    ...(task.evidence ? { evidence: task.evidence } : {}),
  }));
}

function completedDateSet(tasks: DailyTaskRecord[]): Set<string> {
  return new Set(
    tasks
      .filter((task) => task.status === "completed")
      .map((task) => task.planDate),
  );
}

function completionStatusLabel(completedTasks: number, totalTasks: number): string {
  if (totalTasks === 0) {
    return "No daily tasks available";
  }

  if (completedTasks === totalTasks) {
    return "Complete";
  }

  return `${completedTasks}/${totalTasks} completed`;
}

function currentStreak(completedDates: Set<string>, today: string): number {
  let cursor = today;
  let days = 0;

  while (completedDates.has(cursor)) {
    days += 1;
    cursor = shiftDate(cursor, -1);
  }

  return days;
}

function isDateInWeek(date: string, weekStart: string): boolean {
  return date >= weekStart && date <= shiftDate(weekStart, 6);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);

  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function dailyPlanFromRow(row: DailyPlanRow): DailyPlan & { createdAt: string } {
  const tasks =
    typeof row.tasks === "string"
      ? JSON.parse(row.tasks) as DailyPlan["tasks"]
      : row.tasks;

  return {
    date: row.plan_date instanceof Date ? row.plan_date.toISOString().slice(0, 10) : String(row.plan_date),
    targetMinutes: row.target_minutes,
    tasks,
    createdAt: toIso(row.created_at),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
