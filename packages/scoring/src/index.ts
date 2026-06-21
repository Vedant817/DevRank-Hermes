import type { EvidenceItem, ScoreBreakdown, ScoreSnapshot } from "@repo/shared";
import { evidenceText, sdeReadinessRubric } from "./rubrics.js";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreLane(evidence: EvidenceItem[], keywords: string[]): number {
  if (evidence.length === 0) {
    return 0;
  }

  const matched = evidence.filter((item) => {
    const text = evidenceText(item);
    return keywords.some((keyword) => text.includes(keyword));
  });

  const coverage = matched.length / Math.max(evidence.length, 1);
  const depthBonus = Math.min(matched.length * 8, 40);

  return clampScore(coverage * 60 + depthBonus);
}

export function computeSdeReadinessSnapshot(
  evidence: EvidenceItem[],
  generatedAt = new Date().toISOString(),
): ScoreSnapshot {
  const breakdown: ScoreBreakdown[] = sdeReadinessRubric.map((lane) => {
    const laneScore = scoreLane(evidence, lane.keywords);
    const matchingEvidence = evidence.filter((item) => {
      const text = evidenceText(item);
      return lane.keywords.some((keyword) => text.includes(keyword));
    });

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
  };
}

export function explainWeakestLanes(snapshot: ScoreSnapshot, limit = 3): string[] {
  return [...snapshot.breakdown]
    .sort((first, second) => first.score - second.score)
    .slice(0, limit)
    .map((lane) => lane.label);
}
