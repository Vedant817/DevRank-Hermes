import type { ScoreSnapshot } from "@repo/shared";

type MentorTask = {
  category: string;
  evidence?: string;
  minutes: number;
  status: string;
  title: string;
};

export type DailyMentorBrief = {
  actions: string[];
  revision: string;
  snapshotGeneratedAt?: string;
  scoreSummary?: string;
  weakestLanes: string[];
};

export function buildDailyMentorBrief(input: {
  planStatus: "current" | "missing" | "stale";
  snapshot?: ScoreSnapshot;
  streakDays: number;
  tasks: MentorTask[];
}): DailyMentorBrief {
  const pending = input.planStatus === "current"
    ? input.tasks.filter((task) => task.status === "pending")
    : [];
  const weakestLanes = input.snapshot
    ? [...input.snapshot.breakdown]
      .sort((first, second) => first.score - second.score)
      .slice(0, 3)
      .map((lane) => lane.label)
    : [];
  const actions = pending.slice(0, 2).map(
    (task) => `Complete ${task.title} (${task.minutes} min) and attach the requested evidence.`,
  );

  if (actions.length === 0) {
    actions.push(input.planStatus === "stale"
      ? "Refresh today's stale plan before selecting the next evidence-producing task."
      : input.planStatus === "missing"
        ? "Generate today's plan, then complete one evidence-producing task."
        : "Today's plan has no pending work; generate the next plan after review.");
  }

  if (weakestLanes[0]) {
    actions.push(`Prioritize ${weakestLanes[0]}; it is the lowest lane in the latest snapshot.`);
  }

  if (input.streakDays === 0) {
    actions.push("Record one completed task today to start the execution streak.");
  }

  const scoreSummary = input.snapshot
    ? [
      `Overall readiness: ${input.snapshot.overall}/100 (${input.snapshot.rubricVersion}).`,
      `Snapshot generated: ${input.snapshot.generatedAt}.`,
      ...input.snapshot.breakdown.map(
        (lane) => `${lane.label}: ${lane.score}/100 from ${lane.evidenceCount} evidence item(s).`,
      ),
    ].join("\n")
    : undefined;

  const revision = [
    input.snapshot?.generatedAt ?? "no-snapshot",
    input.planStatus,
    ...input.tasks.map((task) => `${task.category}:${task.status}:${task.title}`),
  ].join("|");

  return {
    actions: actions.slice(0, 4),
    revision,
    ...(input.snapshot ? { snapshotGeneratedAt: input.snapshot.generatedAt } : {}),
    ...(scoreSummary ? { scoreSummary } : {}),
    weakestLanes,
  };
}

export function isFreshMentorSnapshot(generatedAt: string, now = new Date()): boolean {
  const ageMs = now.getTime() - new Date(generatedAt).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1_000;
}
