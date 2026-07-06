import type { DsaDifficulty, DsaQuestion } from "@repo/shared";

// Weekday topic ladder aligned with WEEKLY_PLAN_TEMPLATE so the daily DSA
// target reinforces the same topic the weekly plan schedules for that day.
// Saturday (build day) and Sunday (review) revisit fundamentals / DP.
const WEEKDAY_TOPICS: Record<number, string> = {
  0: "Dynamic Programming",
  1: "Arrays/Hashing",
  2: "Binary Search/Two Pointers",
  3: "Stack/Queue/Linked List",
  4: "Trees/Graphs",
  5: "Dynamic Programming",
  6: "Arrays/Hashing",
};

const DEFAULT_TOPIC = "Arrays/Hashing";
const DEFAULT_TARGET_COUNT = 2;
const MAX_TARGET_COUNT = 5;

export interface SelectDsaTargetsOptions {
  count?: number;
  date: string;
  dsaLaneScore?: number;
}

export function selectDailyDsaTargets(
  bank: DsaQuestion[],
  options: SelectDsaTargetsOptions,
): DsaQuestion[] {
  if (bank.length === 0) {
    return [];
  }

  const count = clampCount(options.count);
  const rotation = daysSinceEpoch(options.date);
  const topic = WEEKDAY_TOPICS[weekdayIndex(options.date)] ?? DEFAULT_TOPIC;
  const preferred = preferredDifficulties(options.dsaLaneScore);

  const topicPool = bank.filter((question) => question.topic === topic);
  const pool = topicPool.length > 0 ? topicPool : [...bank];
  const ordered = orderByDifficultyPreference(pool, preferred, rotation);

  return ordered.slice(0, Math.min(count, ordered.length));
}

export function formatDsaTarget(question: DsaQuestion): string {
  return `${question.title} (${question.topic}, ${question.difficulty})`;
}

function orderByDifficultyPreference(
  pool: DsaQuestion[],
  preferred: DsaDifficulty[],
  rotation: number,
): DsaQuestion[] {
  const ordered: DsaQuestion[] = [];

  for (const difficulty of preferred) {
    const tier = pool
      .filter((question) => question.difficulty === difficulty)
      .sort((first, second) => first.slug.localeCompare(second.slug));

    if (tier.length === 0) {
      continue;
    }

    const offset = rotation % tier.length;
    ordered.push(...tier.slice(offset), ...tier.slice(0, offset));
  }

  return ordered;
}

function preferredDifficulties(score: number | undefined): DsaDifficulty[] {
  if (score !== undefined && score >= 80) {
    return ["hard", "medium", "easy"];
  }

  if (score !== undefined && score >= 50) {
    return ["medium", "hard", "easy"];
  }

  return ["easy", "medium", "hard"];
}

function clampCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_TARGET_COUNT;
  }

  return Math.min(MAX_TARGET_COUNT, Math.max(1, Math.trunc(value)));
}

function weekdayIndex(date: string): number {
  const parsed = new Date(`${date}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? 1 : parsed.getUTCDay();
}

function daysSinceEpoch(date: string): number {
  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed.getTime() / 86_400_000));
}
