import type { EvidenceItem, ScoreBreakdown, ScoreSnapshot } from "@repo/shared";
import {
  evidenceText,
  sdeReadinessRubric,
  sdeReadinessRubricVersion,
} from "./rubrics.js";

export interface ScoreTrend {
  currentGeneratedAt: string;
  lanes: ScoreTrendLane[];
  overallChange: number;
  previousGeneratedAt: string;
}

export interface ScoreTrendLane {
  change: number;
  currentScore: number;
  label: string;
  previousScore: number;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreLane(matchingEvidenceCount: number): number {
  if (matchingEvidenceCount === 0) {
    return 0;
  }

  return clampScore(60 + Math.min(matchingEvidenceCount * 8, 40));
}

export function computeSdeReadinessSnapshot(
  evidence: EvidenceItem[],
  generatedAt = new Date().toISOString(),
): ScoreSnapshot {
  const breakdown: ScoreBreakdown[] = sdeReadinessRubric.map((lane) => {
    const matchingEvidence = evidence.filter((item) => {
      const text = evidenceText(item);
      return lane.keywords.some((keyword) => keywordMatchesText(text, keyword));
    });
    const laneScore = scoreLane(matchingEvidence.length);

    return {
      label: lane.label,
      score: laneScore,
      weight: lane.weight,
      evidenceCount: matchingEvidence.length,
      explanation:
        matchingEvidence.length > 0
          ? `Matched ${matchingEvidence.length} evidence item(s).`
          : "No matching evidence yet.",
    };
  });

  const overall = clampScore(
    breakdown.reduce((total, lane) => total + lane.score * lane.weight, 0),
  );

  return {
    overall,
    generatedAt,
    breakdown,
    rubricVersion: sdeReadinessRubricVersion,
  };
}

export function isCurrentSdeReadinessSnapshot(snapshot: ScoreSnapshot): boolean {
  if (snapshot.rubricVersion !== sdeReadinessRubricVersion) {
    return false;
  }

  if (snapshot.breakdown.length !== sdeReadinessRubric.length) {
    return false;
  }

  const expectedByLabel = new Map(
    sdeReadinessRubric.map((lane) => [lane.label, lane.weight]),
  );

  for (const lane of snapshot.breakdown) {
    const expectedWeight = expectedByLabel.get(lane.label);

    if (expectedWeight === undefined || Math.abs(lane.weight - expectedWeight) > 0.000001) {
      return false;
    }
  }

  return true;
}

export function computeScoreTrend(
  current: ScoreSnapshot,
  recentSnapshots: ScoreSnapshot[],
): ScoreTrend | undefined {
  const currentTimestamp = timestampValue(current.generatedAt);
  const previous = recentSnapshots
    .filter((candidate) =>
      timestampValue(candidate.generatedAt) < currentTimestamp &&
      scoreSnapshotsAreComparable(current, candidate),
    )
    .sort((first, second) =>
      timestampValue(second.generatedAt) - timestampValue(first.generatedAt),
    )[0];

  if (!previous) {
    return undefined;
  }

  const previousByLabel = new Map(
    previous.breakdown.map((lane) => [lane.label, lane.score]),
  );

  return {
    currentGeneratedAt: current.generatedAt,
    lanes: current.breakdown.map((lane) => {
      const previousScore = previousByLabel.get(lane.label) ?? lane.score;

      return {
        change: lane.score - previousScore,
        currentScore: lane.score,
        label: lane.label,
        previousScore,
      };
    }),
    overallChange: current.overall - previous.overall,
    previousGeneratedAt: previous.generatedAt,
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

export function explainWeakestLanes(snapshot: ScoreSnapshot, limit = 3): string[] {
  return [...snapshot.breakdown]
    .sort((first, second) => first.score - second.score)
    .slice(0, limit)
    .map((lane) => lane.label);
}

function scoreSnapshotsAreComparable(
  current: ScoreSnapshot,
  previous: ScoreSnapshot,
): boolean {
  if (current.rubricVersion !== previous.rubricVersion) {
    return false;
  }

  if (current.breakdown.length !== previous.breakdown.length) {
    return false;
  }

  const previousWeights = new Map(
    previous.breakdown.map((lane) => [lane.label, lane.weight]),
  );

  return current.breakdown.every((lane) => {
    const previousWeight = previousWeights.get(lane.label);

    return previousWeight !== undefined &&
      Math.abs(previousWeight - lane.weight) <= 0.000001;
  });
}

function timestampValue(value: string): number {
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
