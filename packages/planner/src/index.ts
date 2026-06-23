import type { DailyPlan, DailyPlanTask, ScoreSnapshot } from "@repo/shared";
import { explainWeakestLanes } from "@repo/scoring";

interface PlanRule {
  category: DailyPlanTask["category"];
  match: string[];
  minutes: number;
  title: string;
}

export interface GenerateDailyPlanOptions {
  date?: string;
  includeDailyEssentials?: boolean;
  maxWeakLaneTasks?: number;
  urgentLinearTask?: string;
}

const DEFAULT_MAX_WEAK_LANE_TASKS = 3;
const MAX_WEAK_LANE_TASKS = 8;
const DAILY_ESSENTIALS: DailyPlanTask[] = [
  {
    title: "DSA: solve Arrays/Hashing - Medium and Binary Search - Medium, then record the patterns.",
    category: "dsa",
    minutes: 45,
    evidence: "Daily DSA target",
  },
  {
    title: "Backend: build one endpoint with validation, pagination, and tests.",
    category: "backend",
    minutes: 60,
    evidence: "Daily backend target",
  },
  {
    title: "System design: revise rate limiter + Redis token bucket tradeoffs.",
    category: "system_design",
    minutes: 45,
    evidence: "Daily system design target",
  },
  {
    title: "GitHub/portfolio: improve one repo README with architecture diagram and setup steps.",
    category: "github",
    minutes: 45,
    evidence: "Daily portfolio target",
  },
  {
    title: "AI-agent: use Hermes/Codex/Claude to generate tests, then manually verify and document changes.",
    category: "ai_agent",
    minutes: 30,
    evidence: "Daily AI-agent target",
  },
  {
    title: "Minimum non-zero day: complete one 15-minute evidence-backed task and log what changed.",
    category: "public_proof",
    minutes: 15,
    evidence: "Minimum non-zero day",
  },
];

const planRules: PlanRule[] = [
  {
    match: ["dsa", "leetcode", "algorithm", "data structure"],
    title: "Solve two medium DSA questions and record the patterns learned.",
    category: "dsa",
    minutes: 45,
  },
  {
    match: ["backend", "api"],
    title: "Build or improve one API endpoint with validation, pagination, and tests.",
    category: "backend",
    minutes: 60,
  },
  {
    match: ["frontend", "ui", "react", "next.js", "accessibility"],
    title: "Improve one frontend workflow with accessible states and responsive layout checks.",
    category: "frontend",
    minutes: 45,
  },
  {
    match: ["system design", "architecture"],
    title: "Revise one system design component and document the tradeoffs.",
    category: "system_design",
    minutes: 45,
  },
  {
    match: ["github", "portfolio", "repository", "readme", "pull request"],
    title: "Improve one repository with README, tests, deployment, or architecture proof.",
    category: "github",
    minutes: 45,
  },
  {
    match: ["test", "testing", "qa", "quality"],
    title: "Add or harden tests around one user-facing or integration-critical path.",
    category: "testing",
    minutes: 45,
  },
  {
    match: ["devops", "cloud", "vercel", "supabase", "ci", "deploy"],
    title: "Verify one deploy, cron, database, or CI path and capture the evidence.",
    category: "devops",
    minutes: 40,
  },
  {
    match: ["ai agent", "automation", "codex", "claude", "hermes"],
    title: "Turn one repeated AI-agent workflow into a reusable documented skill.",
    category: "ai_agent",
    minutes: 30,
  },
  {
    match: ["communication", "content", "public proof", "resume", "linkedin", "docs"],
    title: "Write one evidence-backed project note, resume bullet, or public proof artifact.",
    category: "public_proof",
    minutes: 30,
  },
];

export function generateDailyPlan(
  snapshot: ScoreSnapshot,
  dateOrOptions: string | GenerateDailyPlanOptions = {},
  urgentLinearTask?: string,
): DailyPlan {
  const options = normalizeOptions(dateOrOptions, urgentLinearTask);
  const weakLanes = explainWeakestLanes(snapshot, options.maxWeakLaneTasks);
  const tasks: DailyPlanTask[] = [];

  if (options.urgentLinearTask) {
    addTask(tasks, {
      title: options.urgentLinearTask,
      category: "linear",
      minutes: 30,
      evidence: "Linear priority",
    });
  }

  if (options.includeDailyEssentials) {
    for (const task of DAILY_ESSENTIALS) {
      addTask(tasks, task);
    }
  }

  for (const lane of weakLanes) {
    addTask(tasks, taskForLane(lane));
  }

  return {
    date: options.date,
    tasks,
    targetMinutes: tasks.reduce((total, task) => total + task.minutes, 0),
  };
}

export function formatDailyPlanForSlack(plan: DailyPlan): string {
  const tasks = plan.tasks
    .map((task, index) => {
      const evidence = task.evidence ? ` - ${task.evidence}` : "";

      return `${index + 1}. ${task.title} (${task.minutes} min)${evidence}`;
    })
    .join("\n");

  return [
    `Good morning. Here is your DevRank OS plan for ${plan.date}.`,
    "",
    "Today's SDE Switch Plan",
    `Target time: ${plan.targetMinutes} min`,
    "Minimum non-zero day: complete one 15-minute evidence-backed task.",
    "",
    tasks,
  ].join("\n");
}

function normalizeOptions(
  dateOrOptions: string | GenerateDailyPlanOptions,
  urgentLinearTask?: string,
): Required<Pick<GenerateDailyPlanOptions, "date" | "includeDailyEssentials" | "maxWeakLaneTasks">> &
  Pick<GenerateDailyPlanOptions, "urgentLinearTask"> {
  if (typeof dateOrOptions === "string") {
    return {
      date: dateOrOptions,
      includeDailyEssentials: true,
      maxWeakLaneTasks: DEFAULT_MAX_WEAK_LANE_TASKS,
      urgentLinearTask: urgentLinearTask?.trim() || undefined,
    };
  }

  return {
    date: dateOrOptions.date ?? new Date().toISOString().slice(0, 10),
    includeDailyEssentials: dateOrOptions.includeDailyEssentials ?? true,
    maxWeakLaneTasks: normalizeTaskLimit(dateOrOptions.maxWeakLaneTasks),
    urgentLinearTask: dateOrOptions.urgentLinearTask?.trim() || undefined,
  };
}

function addTask(tasks: DailyPlanTask[], task: DailyPlanTask): void {
  const existing = tasks.find((candidate) => candidate.category === task.category);

  if (!existing) {
    tasks.push({ ...task });
    return;
  }

  if (!existing.evidence && task.evidence) {
    existing.evidence = task.evidence;
    return;
  }

  if (existing.evidence && task.evidence && !existing.evidence.includes(task.evidence)) {
    existing.evidence = `${existing.evidence}; ${task.evidence}`;
  }
}

function taskForLane(lane: string): DailyPlanTask {
  const normalizedLane = lane.toLowerCase();
  const rule = planRules.find((candidate) =>
    candidate.match.some((keyword) => keywordMatchesText(normalizedLane, keyword)),
  );

  if (!rule) {
    return {
      title: `Create evidence for ${lane}.`,
      category: "public_proof",
      minutes: 30,
      evidence: lane,
    };
  }

  return {
    title: rule.title,
    category: rule.category,
    minutes: rule.minutes,
    evidence: lane,
  };
}

function keywordMatchesText(text: string, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();

  if (normalized.length === 0) {
    return false;
  }

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");

  return pattern.test(text);
}

function normalizeTaskLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_WEAK_LANE_TASKS;
  }

  return Math.min(MAX_WEAK_LANE_TASKS, Math.max(1, Math.trunc(value)));
}
