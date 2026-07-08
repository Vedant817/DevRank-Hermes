import { createHash } from "node:crypto";
import type { MarketBenchmark } from "@repo/search";
import {
  sdeReadinessRubric,
  sdeReadinessRubricVersion,
  type RubricLane,
} from "./rubrics.js";

export const MAX_RUBRIC_DRIFT_PCT = 0.15;

export const RUBRIC_ADJUSTMENT_CADENCE = "weekly" as const;

export interface WeightAdjustmentOptions {
  maxDriftPct?: number;
}

function rubricsEqual(first: RubricLane[], second: RubricLane[]): boolean {
  if (first.length !== second.length) {
    return false;
  }

  const byLabel = new Map(second.map((lane) => [lane.label, lane]));

  return first.every((lane) => {
    const other = byLabel.get(lane.label);

    return (
      other !== undefined &&
      Math.abs(other.weight - lane.weight) <= 0.000001 &&
      other.keywords.length === lane.keywords.length &&
      other.keywords.every((keyword, index) => keyword === lane.keywords[index])
    );
  });
}

export function deriveRubricVersion(
  base: RubricLane[],
  override: RubricLane[],
): string {
  if (rubricsEqual(base, override)) {
    return sdeReadinessRubricVersion;
  }

  const weightMap = [...override]
    .sort((first, second) => first.label.localeCompare(second.label))
    .map((lane) => `${lane.label}=${lane.weight.toFixed(6)}`)
    .join("|");
  const hash = createHash("sha256").update(weightMap).digest("hex").slice(0, 8);

  return `${sdeReadinessRubricVersion}-${hash}`;
}

export function applyMarketWeightAdjustment(
  base?: RubricLane[],
  benchmark?: MarketBenchmark,
  options: WeightAdjustmentOptions = {},
): RubricLane[] {
  const resolved = base ?? sdeReadinessRubric;
  const maxDrift = options.maxDriftPct ?? MAX_RUBRIC_DRIFT_PCT;
  const result = resolved.map((lane) => ({ ...lane, keywords: [...lane.keywords] }));

  if (!benchmark || benchmark.missingSkills.length === 0) {
    return result;
  }

  const missing = new Set(benchmark.missingSkills.map((skill) => skill.toLowerCase()));
  const frequency = benchmark.skillFrequency ?? {};
  const signals = result.map((lane) =>
    lane.keywords.reduce((total, keyword) => {
      const key = keyword.toLowerCase();

      if (missing.has(key)) {
        return total + 1 + (frequency[key] ?? 1);
      }

      return total;
    }, 0),
  );
  const maxSignal = Math.max(0, ...signals);

  if (maxSignal === 0) {
    return result;
  }

  const driftFractions = signals.map((signal) =>
    signal === 0 ? 0 : Math.min(maxDrift, (signal / maxSignal) * maxDrift),
  );
  const targetDeltas = result.map((lane, index) => lane.weight * (driftFractions[index] ?? 0));
  const totalUp = targetDeltas.reduce((total, delta) => total + delta, 0);

  const capacities = result.map((lane, index) =>
    signals[index] === 0 ? lane.weight * maxDrift : 0,
  );
  const totalCapacity = capacities.reduce((total, capacity) => total + capacity, 0);

  if (totalCapacity <= 0 || totalUp <= 0) {
    return result;
  }

  const effectiveUp = Math.min(totalUp, totalCapacity);
  const scale = effectiveUp / totalUp;

  const losses = result.map((lane, index) =>
    effectiveUp === 0 || totalCapacity === 0
      ? 0
      : effectiveUp * ((capacities[index] ?? 0) / totalCapacity),
  );

  return result.map((lane, index) => ({
    ...lane,
    weight: lane.weight + (targetDeltas[index] ?? 0) * scale - (losses[index] ?? 0),
  }));
}
