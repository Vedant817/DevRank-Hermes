import {
  insertScoreSnapshot,
  listScoringEvidence,
  type SqlClient,
} from "@repo/db";
import {
  computeSdeReadinessSnapshot,
  isCurrentSdeReadinessSnapshot,
} from "@repo/scoring";
import type { ScoreSnapshot } from "@repo/shared";

export type CurrentScoreSnapshotResult = {
  evidenceCount?: number;
  snapshot?: ScoreSnapshot;
  status: "created" | "current" | "missing_evidence" | "refreshed" | "stale_without_evidence";
};

export async function ensureCurrentScoreSnapshot(
  sql: SqlClient,
  snapshot: ScoreSnapshot | undefined,
): Promise<CurrentScoreSnapshotResult> {
  if (snapshot && isCurrentSdeReadinessSnapshot(snapshot)) {
    return {
      snapshot,
      status: "current",
    };
  }

  const evidence = await listScoringEvidence(sql);

  if (evidence.length === 0) {
    return {
      status: snapshot ? "stale_without_evidence" : "missing_evidence",
    };
  }

  const refreshedSnapshot = computeSdeReadinessSnapshot(evidence);
  await insertScoreSnapshot(sql, refreshedSnapshot);

  return {
    evidenceCount: evidence.length,
    snapshot: refreshedSnapshot,
    status: snapshot ? "refreshed" : "created",
  };
}
