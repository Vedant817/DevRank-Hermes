export interface DirectionalOutcomeReport {
  scoreStart: number | null;
  scoreEnd: number | null;
  scoreDelta: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  outcomeCounts: Record<string, number>;
  totalOutcomes: number;
  summary: string;
}

export interface OutcomeCorrelationInput {
  scoreSnapshots: Array<{ overall: number; generatedAt: string }>;
  outcomeEvents: Array<{ eventType: string; occurredAt: string; company?: string; role?: string }>;
  windowStart?: string;
  windowEnd?: string;
}

function timestampValue(value: string): number {
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function buildDirectionalOutcomeReport(input: OutcomeCorrelationInput): DirectionalOutcomeReport {
  const { scoreSnapshots, outcomeEvents, windowStart, windowEnd } = input;

  const scoreStart = scoreSnapshots.length === 0
    ? null
    : scoreSnapshots.reduce((earliest, candidate) =>
      timestampValue(candidate.generatedAt) < timestampValue(earliest.generatedAt)
        ? candidate
        : earliest,
    ).overall;

  const scoreEnd = scoreSnapshots.length === 0
    ? null
    : scoreSnapshots.reduce((latest, candidate) =>
      timestampValue(candidate.generatedAt) > timestampValue(latest.generatedAt)
        ? candidate
        : latest,
    ).overall;

  const scoreDelta = scoreStart === null || scoreEnd === null ? null : scoreEnd - scoreStart;

  const windowStartValue = windowStart ?? null;
  const windowEndValue = windowEnd ?? null;

  const inWindow = outcomeEvents.filter((event) => {
    const occurred = timestampValue(event.occurredAt);

    if (windowStartValue !== null && occurred < timestampValue(windowStartValue)) {
      return false;
    }

    if (windowEndValue !== null && occurred > timestampValue(windowEndValue)) {
      return false;
    }

    return true;
  });

  const outcomeCounts: Record<string, number> = {};

  for (const event of inWindow) {
    const key = event.eventType;
    outcomeCounts[key] = (outcomeCounts[key] ?? 0) + 1;
  }

  const totalOutcomes = inWindow.length;

  let summary: string;

  if (scoreSnapshots.length === 0) {
    summary = "No score snapshots available to summarize.";
  } else if (totalOutcomes === 0) {
    summary =
      `SDE readiness moved from ${scoreStart} to ${scoreEnd}; no outcomes were logged in this window.`;
  } else {
    const parts = Object.entries(outcomeCounts).map(
      ([eventType, count]) => `${count} ${eventType}(s)`,
    );

    summary =
      `SDE readiness moved from ${scoreStart} to ${scoreEnd}; you logged ${parts.join(" and ")} in this window.`;
  }

  return {
    outcomeCounts,
    scoreDelta,
    scoreEnd,
    scoreStart,
    summary,
    totalOutcomes,
    windowEnd: windowEndValue,
    windowStart: windowStartValue,
  };
}
