import type { DailyPlan, DailyPlanTask, DsaQuestion, ScoreSnapshot, WeeklyPlan, WeeklyPlanTask } from "@repo/shared";
import { formatDsaTarget, selectDailyDsaTargets } from "./dsa.js";

export * from "./dsa.js";

type ScoreBreakdown = ScoreSnapshot["breakdown"][number];

interface PlanRule {
  advancedTitle: string;
  category: DailyPlanTask["category"];
  match: string[];
  minutes: number;
  missingTitle: string;
  title: string;
}

export interface GenerateDailyPlanOptions {
  date?: string;
  dsaQuestionBank?: DsaQuestion[];
  includeDailyEssentials?: boolean;
  linearSyncWarning?: string;
  maxWeakLaneTasks?: number;
  urgentLinearTask?: string;
  benchmarkSkillGap?: {
    missingSkills: string[];
    weeklyLearningPriorities: string[];
    skillFrequency?: Record<string, number>;
  };
}

const DAILY_DSA_TARGET_COUNT = 2;

export interface GenerateWeeklyPlanOptions {
  generatedAt?: string;
  maxWeakLaneTasks?: number;
  weekStart?: string;
  benchmarkSkillGap?: {
    missingSkills: string[];
    weeklyLearningPriorities: string[];
    skillFrequency?: Record<string, number>;
  };
}

const DEFAULT_MAX_WEAK_LANE_TASKS = 3;
const MAX_WEAK_LANE_TASKS = 8;
const DAILY_ESSENTIAL_CATEGORIES: DailyPlanTask["category"][] = [
  "dsa",
  "backend",
  "system_design",
  "github",
  "ai_agent",
  "public_proof",
];

const WEEKLY_PLAN_TEMPLATE: WeeklyPlanTask[] = [
  {
    day: "Monday",
    title: "Arrays/Hashing: solve two medium questions and record reusable patterns.",
    category: "dsa",
    minutes: 45,
    evidence: "Monday DSA ladder",
  },
  {
    day: "Monday",
    title: "Backend API: ship or harden one endpoint with validation and tests.",
    category: "backend",
    minutes: 60,
    evidence: "Monday backend API",
  },
  {
    day: "Tuesday",
    title: "Binary Search/Two Pointers: solve two focused questions and compare templates.",
    category: "dsa",
    minutes: 45,
    evidence: "Tuesday DSA ladder",
  },
  {
    day: "Tuesday",
    title: "Database design: model one project table, indexes, and failure cases.",
    category: "backend",
    minutes: 60,
    evidence: "Tuesday database design",
  },
  {
    day: "Wednesday",
    title: "Stack/Queue/Linked List: solve two implementation-heavy questions.",
    category: "dsa",
    minutes: 45,
    evidence: "Wednesday DSA ladder",
  },
  {
    day: "Wednesday",
    title: "Testing/CI: add or harden tests for one production-critical path.",
    category: "testing",
    minutes: 60,
    evidence: "Wednesday testing and CI",
  },
  {
    day: "Thursday",
    title: "Trees/Graphs: solve traversal plus shortest-path or connected-components practice.",
    category: "dsa",
    minutes: 60,
    evidence: "Thursday DSA ladder",
  },
  {
    day: "Thursday",
    title: "System design: document capacity, data model, API, cache, and failure tradeoffs.",
    category: "system_design",
    minutes: 60,
    evidence: "Thursday system design",
  },
  {
    day: "Friday",
    title: "DP basics: solve one memoization and one tabulation exercise.",
    category: "dsa",
    minutes: 60,
    evidence: "Friday DSA ladder",
  },
  {
    day: "Friday",
    title: "Project feature: deliver one end-to-end feature slice with tests and docs.",
    category: "github",
    minutes: 90,
    evidence: "Friday project feature",
  },
  {
    day: "Saturday",
    title: "Build day: open one solid PR with code, tests, validation evidence, and review notes.",
    category: "github",
    minutes: 120,
    evidence: "Saturday build day",
  },
  {
    day: "Saturday",
    title: "AI-agent workflow: turn one repeated workflow into a reusable prompt, script, or skill.",
    category: "ai_agent",
    minutes: 30,
    evidence: "Saturday AI-agent improvement",
  },
  {
    day: "Sunday",
    title: "Review dashboard: inspect score movement, completed tasks, and weak lanes.",
    category: "system_design",
    minutes: 45,
    evidence: "Sunday dashboard review",
  },
  {
    day: "Sunday",
    title: "Update resume, LinkedIn, X, or portfolio with one evidence-backed public proof note.",
    category: "public_proof",
    minutes: 60,
    evidence: "Sunday public proof",
  },
  {
    day: "Sunday",
    title: "Plan next week from weak lanes, active Linear priority, and market benchmark gaps.",
    category: "linear",
    minutes: 30,
    evidence: "Sunday next-week planning",
  },
];

const planRules: PlanRule[] = [
  {
    match: ["dsa", "leetcode", "algorithm", "data structure"],
    missingTitle: "Establish DSA evidence by solving one medium problem and recording the pattern and complexity.",
    title: "Solve two medium DSA questions and record the patterns learned.",
    advancedTitle: "Solve one harder DSA problem under time constraints and compare two valid approaches.",
    category: "dsa",
    minutes: 45,
  },
  {
    match: ["backend", "api"],
    missingTitle: "Establish backend evidence by shipping one validated endpoint with a focused test.",
    title: "Build or improve one API endpoint with validation, pagination, and tests.",
    advancedTitle: "Harden one backend path for concurrency, retries, or failure recovery and prove it with tests.",
    category: "backend",
    minutes: 60,
  },
  {
    match: ["frontend", "ui", "react", "next.js", "accessibility"],
    missingTitle: "Establish frontend evidence with one responsive, accessible workflow and interaction test.",
    title: "Improve one frontend workflow with accessible states and responsive layout checks.",
    advancedTitle: "Profile and harden one frontend workflow for accessibility, performance, and failure states.",
    category: "frontend",
    minutes: 45,
  },
  {
    match: ["system design", "architecture"],
    missingTitle: "Establish system-design evidence by documenting requirements, data flow, and one failure mode.",
    title: "Revise one system design component and document the tradeoffs.",
    advancedTitle: "Stress-test one architecture decision with capacity estimates, failure recovery, and alternatives.",
    category: "system_design",
    minutes: 45,
  },
  {
    match: ["github", "portfolio", "repository", "readme", "pull request"],
    missingTitle: "Establish portfolio evidence by documenting one repository's problem, architecture, setup, and validation.",
    title: "Improve one repository with README, tests, deployment, or architecture proof.",
    advancedTitle: "Turn the strongest repository into reviewable proof with a focused PR, validation evidence, and deployment notes.",
    category: "github",
    minutes: 45,
  },
  {
    match: ["test", "testing", "qa", "quality"],
    missingTitle: "Establish testing evidence with a regression test for one production-critical behavior.",
    title: "Add or harden tests around one user-facing or integration-critical path.",
    advancedTitle: "Add adversarial integration coverage for concurrency, retries, or partial failure.",
    category: "testing",
    minutes: 45,
  },
  {
    match: ["devops", "cloud", "vercel", "supabase", "ci", "deploy"],
    missingTitle: "Establish deployment evidence by running one production-like build or deploy check and recording the result.",
    title: "Verify one deploy, cron, database, or CI path and capture the evidence.",
    advancedTitle: "Exercise rollback, alerting, or recovery for one deployed path and document the operational result.",
    category: "devops",
    minutes: 40,
  },
  {
    match: ["ai agent", "automation", "codex", "claude", "hermes"],
    missingTitle: "Establish AI-agent evidence by completing one bounded task with manual verification and a saved result.",
    title: "Turn one repeated AI-agent workflow into a reusable documented skill.",
    advancedTitle: "Evaluate one reusable agent workflow against failure cases and improve its validation gate.",
    category: "ai_agent",
    minutes: 30,
  },
  {
    match: ["communication", "content", "public proof", "resume", "linkedin", "docs"],
    missingTitle: "Establish public proof with one concise note linked to a real commit, PR, test, or deployment.",
    title: "Write one evidence-backed project note, resume bullet, or public proof artifact.",
    advancedTitle: "Publish a technical explanation that connects measured results to architecture and tradeoffs.",
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
  const weakLanes = weakestBreakdown(snapshot, options.maxWeakLaneTasks, options.benchmarkSkillGap);
  const tasks: DailyPlanTask[] = [];

  const linearTask = linearTaskForOptions(options);

  if (linearTask) {
    addTask(tasks, linearTask);
  }

  if (options.includeDailyEssentials) {
    for (const category of DAILY_ESSENTIAL_CATEGORIES) {
      const task = taskForCategory(snapshot, category);

      addTask(tasks, category === "public_proof" ? { ...task, minutes: 15 } : task);
    }
  }

  for (const lane of weakLanes) {
    addTask(tasks, taskForLane(lane));
  }

  if (options.benchmarkSkillGap && options.benchmarkSkillGap.missingSkills.length > 0) {
    enrichTasksWithMarketSignal(tasks, options.benchmarkSkillGap);
  }

  const dsaQuestionBank = typeof dateOrOptions === "object" ? dateOrOptions.dsaQuestionBank : undefined;

  if (dsaQuestionBank && dsaQuestionBank.length > 0) {
    applyDsaTargets(tasks, selectDailyDsaTargets(dsaQuestionBank, {
      count: DAILY_DSA_TARGET_COUNT,
      date: options.date,
      dsaLaneScore: dsaLaneScore(snapshot),
    }));
  }

  return {
    date: options.date,
    tasks,
    targetMinutes: tasks.reduce((total, task) => total + task.minutes, 0),
  };
}

function dsaLaneScore(snapshot: ScoreSnapshot): number | undefined {
  return snapshot.breakdown.find((lane) => lane.label.toLowerCase().includes("dsa"))?.score;
}

function applyDsaTargets(tasks: DailyPlanTask[], targets: DsaQuestion[]): void {
  if (targets.length === 0) {
    return;
  }

  const dsaTask = tasks.find((task) => task.category === "dsa");

  if (!dsaTask) {
    return;
  }

  const list = targets.map(formatDsaTarget).join("; ");
  const urls = targets.map((target) => target.url).join(" ");

  dsaTask.title = `Solve ${targets.length} DSA question(s): ${list}. Record patterns and complexity.`;
  dsaTask.evidence = dsaTask.evidence ? `${dsaTask.evidence}; ${urls}` : urls;
}

function enrichTasksWithMarketSignal(
  tasks: DailyPlanTask[],
  benchmarkGap: { missingSkills: string[]; weeklyLearningPriorities: string[]; skillFrequency?: Record<string, number> },
): void {
  const missingSkillsLower = benchmarkGap.missingSkills.map((s) => s.toLowerCase());

  for (const task of tasks) {
    const rule = planRules.find((candidate) => candidate.category === task.category);

    if (!rule) continue;

    const overlap = rule.match.filter((keyword) =>
      missingSkillsLower.some((skill) => keyword.toLowerCase().includes(skill) || skill.includes(keyword.toLowerCase())),
    );

    if (overlap.length === 0) continue;

    const marketSignal = overlap
      .slice(0, 2)
      .map((skill) => {
        const count = benchmarkGap.skillFrequency?.[skill];
        return count !== undefined
          ? `${skill} (${count}/100 postings)`
          : `${skill} appears in market postings`;
      })
      .join("; ");

    task.title = `${task.title} (market signal: ${marketSignal})`;
    task.evidence = task.evidence
      ? `${task.evidence}; market gap: ${overlap.join(", ")}`
      : `market gap: ${overlap.join(", ")}`;
  }
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

export function generateWeeklyPlan(
  snapshot: ScoreSnapshot,
  options: GenerateWeeklyPlanOptions = {},
): WeeklyPlan {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const weekStart = options.weekStart ?? mondayOfDate(new Date(generatedAt));
  const weakLanes = weakestBreakdown(snapshot, normalizeTaskLimit(options.maxWeakLaneTasks));
  const weeklyGoal = weakLanes.length > 0
    ? `Improve ${weakLanes.map((lane) => lane.label).join(", ")} with one evidence-backed ship each day.`
    : "Maintain daily SDE growth with one evidence-backed ship each day.";
  const tasks = WEEKLY_PLAN_TEMPLATE.map((task) => enrichWeeklyTask(task, weakLanes));

  if (options.benchmarkSkillGap && options.benchmarkSkillGap.missingSkills.length > 0) {
    enrichTasksWithMarketSignal(tasks as DailyPlanTask[], options.benchmarkSkillGap);
  }

  return {
    weekStart,
    weeklyGoal,
    tasks,
    targetMinutes: tasks.reduce((total, task) => total + task.minutes, 0),
    generatedAt,
  };
}

function normalizeOptions(
  dateOrOptions: string | GenerateDailyPlanOptions,
  urgentLinearTask?: string,
): Required<Pick<GenerateDailyPlanOptions, "date" | "includeDailyEssentials" | "maxWeakLaneTasks">> &
  Pick<GenerateDailyPlanOptions, "benchmarkSkillGap" | "linearSyncWarning" | "urgentLinearTask"> {
  if (typeof dateOrOptions === "string") {
    return {
      benchmarkSkillGap: undefined,
      date: dateOrOptions,
      includeDailyEssentials: true,
      linearSyncWarning: undefined,
      maxWeakLaneTasks: DEFAULT_MAX_WEAK_LANE_TASKS,
      urgentLinearTask: normalizePlannerText(urgentLinearTask),
    };
  }

  return {
    benchmarkSkillGap: dateOrOptions.benchmarkSkillGap,
    date: dateOrOptions.date ?? new Date().toISOString().slice(0, 10),
    includeDailyEssentials: dateOrOptions.includeDailyEssentials ?? true,
    linearSyncWarning: normalizePlannerText(dateOrOptions.linearSyncWarning),
    maxWeakLaneTasks: normalizeTaskLimit(dateOrOptions.maxWeakLaneTasks),
    urgentLinearTask: normalizePlannerText(dateOrOptions.urgentLinearTask),
  };
}

function linearTaskForOptions(
  options: Required<Pick<GenerateDailyPlanOptions, "date" | "includeDailyEssentials" | "maxWeakLaneTasks">> &
    Pick<GenerateDailyPlanOptions, "benchmarkSkillGap" | "linearSyncWarning" | "urgentLinearTask">,
): DailyPlanTask | undefined {
  if (!options.linearSyncWarning && !options.urgentLinearTask) {
    return undefined;
  }

  if (options.linearSyncWarning && options.urgentLinearTask) {
    return {
      title: `${options.linearSyncWarning} Last known priority: ${options.urgentLinearTask}`,
      category: "linear",
      minutes: 35,
      evidence: "Linear sync health; Linear priority",
    };
  }

  if (options.linearSyncWarning) {
    return {
      title: options.linearSyncWarning,
      category: "linear",
      minutes: 20,
      evidence: "Linear sync health",
    };
  }

  return {
    title: options.urgentLinearTask ?? "",
    category: "linear",
    minutes: 30,
    evidence: "Linear priority",
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

function taskForCategory(
  snapshot: ScoreSnapshot,
  category: DailyPlanTask["category"],
): DailyPlanTask {
  const rule = planRules.find((candidate) => candidate.category === category);

  if (!rule) {
    throw new Error(`No planner rule exists for category: ${category}`);
  }

  const lane = snapshot.breakdown.find((candidate) => laneMatchesRule(candidate, rule));

  if (!lane) {
    return {
      title: rule.missingTitle,
      category: rule.category,
      minutes: rule.minutes,
      evidence: "Rubric lane unavailable; baseline task selected",
    };
  }

  return taskForRule(rule, lane);
}

function taskForLane(lane: ScoreBreakdown): DailyPlanTask {
  const normalizedLane = lane.label.toLowerCase();
  const rule = planRules.find((candidate) =>
    candidate.match.some((keyword) => keywordMatchesText(normalizedLane, keyword)),
  );

  if (!rule) {
    return {
      title: `Create evidence for ${lane.label}.`,
      category: "public_proof",
      minutes: 30,
      evidence: laneEvidence(lane),
    };
  }

  return taskForRule(rule, lane);
}

function taskForRule(rule: PlanRule, lane: ScoreBreakdown): DailyPlanTask {
  return {
    title: adaptiveTitle(rule, lane),
    category: rule.category,
    minutes: rule.minutes,
    evidence: laneEvidence(lane),
  };
}

function adaptiveTitle(rule: PlanRule, lane: ScoreBreakdown): string {
  if (lane.evidenceCount === 0) {
    return rule.missingTitle;
  }

  if (lane.score >= 80 && lane.evidenceCount >= 3) {
    return rule.advancedTitle;
  }

  return rule.title;
}

function laneEvidence(lane: ScoreBreakdown): string {
  const itemLabel = lane.evidenceCount === 1 ? "item" : "items";

  return `${lane.label}: ${lane.score}% from ${lane.evidenceCount} evidence ${itemLabel}`;
}

function laneMatchesRule(lane: ScoreBreakdown, rule: PlanRule): boolean {
  const normalizedLane = lane.label.toLowerCase();

  return rule.match.some((keyword) => keywordMatchesText(normalizedLane, keyword));
}

function weakestBreakdown(
  snapshot: ScoreSnapshot,
  limit: number,
  benchmarkGap?: { missingSkills: string[]; weeklyLearningPriorities?: string[]; skillFrequency?: Record<string, number> },
): ScoreBreakdown[] {
  const missingLower = (benchmarkGap?.missingSkills ?? []).map(s => s.toLowerCase());

  return [...snapshot.breakdown]
    .map(lane => ({
      lane,
      boosted: missingLower.some(skill => lane.label.toLowerCase().includes(skill)),
    }))
    .sort((a, b) => {
      const groupDiff = (a.boosted ? 0 : 1) - (b.boosted ? 0 : 1);
      if (groupDiff !== 0) return groupDiff;
      const scoreDiff = a.lane.score - b.lane.score;
      if (scoreDiff !== 0) return scoreDiff;
      if (a.lane.evidenceCount !== b.lane.evidenceCount) return a.lane.evidenceCount - b.lane.evidenceCount;
      return a.lane.label.localeCompare(b.lane.label);
    })
    .slice(0, limit)
    .map(entry => entry.lane);
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

function normalizePlannerText(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, 280);
}

function enrichWeeklyTask(task: WeeklyPlanTask, weakLanes: ScoreBreakdown[]): WeeklyPlanTask {
  const matchingLane = weakLanes.find((lane) => {
    const normalizedLane = lane.label.toLowerCase();

    return task.category === taskForLane(lane).category ||
      normalizedLane.includes(task.category.replace("_", " "));
  });

  if (!matchingLane) {
    return { ...task };
  }

  return {
    ...task,
    title: `${task.title} ${weeklyAdjustment(matchingLane)}`,
    evidence: task.evidence
      ? `${task.evidence}; ${laneEvidence(matchingLane)}`
      : laneEvidence(matchingLane),
  };
}

function weeklyAdjustment(lane: ScoreBreakdown): string {
  if (lane.evidenceCount === 0) {
    return "Finish with the first persisted proof for this lane.";
  }

  if (lane.score >= 80 && lane.evidenceCount >= 3) {
    return "Increase the difficulty and document tradeoffs instead of repeating existing proof.";
  }

  return `Add independent proof beyond the ${lane.evidenceCount} existing evidence item(s).`;
}

function mondayOfDate(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;

  utcDate.setUTCDate(utcDate.getUTCDate() + offset);

  return utcDate.toISOString().slice(0, 10);
}
