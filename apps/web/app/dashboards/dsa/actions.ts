"use server";

import {
  closeSqlClient,
  createSqlClient,
  getDsaQuestionBySlug,
  insertEvidenceItemIfAbsent,
  insertScoreSnapshot,
  listScoringEvidence,
  runInTransaction,
  type SqlClient,
} from "@repo/db";
import { computeSdeReadinessSnapshot } from "@repo/scoring";
import type { EvidenceItem, ScoreSnapshot } from "@repo/shared";
import { revalidatePath } from "next/cache";
import { isDashboardActionAuthorized } from "../../_lib/dashboard-auth";

export type MarkDsaSolvedResult = {
  ok: boolean;
  error?: string;
  overallDelta?: number;
  dsaDelta?: number;
  solvedTitle?: string;
};

export async function markDsaSolved(slug: string, minutes: number): Promise<MarkDsaSolvedResult> {
  if (!await isDashboardActionAuthorized()) {
    return { ok: false, error: "Dashboard requires authentication." };
  }

  if (typeof slug !== "string" || !/^[a-z0-9-]{1,100}$/.test(slug) || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
    return { ok: false, error: "Invalid question or solve duration." };
  }

  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    const question = await getDsaQuestionBySlug(sql, slug);

    if (!question) {
      return { ok: false, error: "DSA question was not found." };
    }

    const date = new Date().toISOString().slice(0, 10);
    const result = await runInTransaction(sql, async (transaction: SqlClient) => {
      const before = computeSdeReadinessSnapshot(await listScoringEvidence(transaction));
      const evidence: EvidenceItem = {
        id: `dsa:${question.slug}:${date}`,
        source: "manual",
        title: `Solved DSA: ${question.title}`,
        summary: `Solved the ${question.difficulty} ${question.topic} algorithm problem. Reviewed ${question.patterns.join(", ") || "the core pattern"} and time and space complexity.`,
        occurredAt: `${date}T12:00:00.000Z`,
        url: question.url,
        metadata: {
          date,
          dsaSlug: question.slug,
          minutes,
          difficulty: question.difficulty,
          topic: question.topic,
        },
      };

      const inserted = await insertEvidenceItemIfAbsent(transaction, evidence);

      if (!inserted) {
        return { overallDelta: 0, dsaDelta: 0 };
      }

      const after = computeSdeReadinessSnapshot(await listScoringEvidence(transaction));
      await insertScoreSnapshot(transaction, after);

      return scoreDelta(before, after);
    });

    revalidatePath("/dashboards/dsa");
    revalidatePath("/dashboards");

    return { ok: true, solvedTitle: question.title, ...result };
  } catch {
    console.error("markDsaSolved failed to persist solve evidence and score snapshot.");
    return { ok: false, error: "The solve could not be recorded. Try again." };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function scoreDelta(before: ScoreSnapshot, after: ScoreSnapshot) {
  return {
    overallDelta: after.overall - before.overall,
    dsaDelta: dsaScore(after) - dsaScore(before),
  };
}

function dsaScore(snapshot: ScoreSnapshot): number {
  return snapshot.breakdown.find((lane) => lane.label === "DSA")?.score ?? 0;
}
