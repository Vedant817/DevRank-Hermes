"use server";

import {
  claimApiRateLimit,
  closeSqlClient,
  createSqlClient,
  getLatestScoreSnapshotForOwner,
} from "@repo/db";
import { resolveHermesProviderChain, runHermesDailyMentor } from "@repo/hermes";
import { readRuntimeEnv } from "@repo/shared";
import { createHash } from "node:crypto";
import { getDashboardActionOwner } from "../../_lib/dashboard-auth";
import { isFreshMentorSnapshot } from "./mentor-brief";

export type GenerateDailyMentorResult = {
  ok: boolean;
  error?: string;
  model?: string;
  plan?: string;
  provider?: string;
};

export async function generateDailyMentor(): Promise<GenerateDailyMentorResult> {
  const ownerId = await getDashboardActionOwner();

  if (!ownerId) {
    return { ok: false, error: "Dashboard requires authentication." };
  }

  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    const snapshot = await getLatestScoreSnapshotForOwner(sql, ownerId);

    if (!snapshot) {
      return { ok: false, error: "Recompute readiness before asking Hermes for coaching." };
    }

    if (!isFreshMentorSnapshot(snapshot.generatedAt)) {
      return { ok: false, error: "The readiness snapshot is older than seven days. Recompute it before asking Hermes." };
    }

    const env = readRuntimeEnv();

    if (resolveHermesProviderChain(env).length === 0) {
      return { ok: false, error: "Hermes is not configured. The deterministic brief remains available." };
    }

    const claim = await claimApiRateLimit(sql, {
      bucketKey: createHash("sha256")
        .update(`daily-mentor|${ownerId}|${snapshot.generatedAt}`)
        .digest("hex"),
      windowMs: 5 * 60_000,
    });

    if (claim.count > 1) {
      return { ok: false, error: "Hermes already reviewed this snapshot recently. Retry after the five-minute cooldown." };
    }

    const weakestLanes = [...snapshot.breakdown]
      .sort((first, second) => first.score - second.score)
      .slice(0, 3)
      .map((lane) => lane.label);
    const scoreSummary = [
      `Overall readiness: ${snapshot.overall}/100 (${snapshot.rubricVersion}).`,
      `Snapshot generated: ${snapshot.generatedAt}.`,
      ...snapshot.breakdown.map(
        (lane) => `${lane.label}: ${lane.score}/100 from ${lane.evidenceCount} evidence item(s).`,
      ),
    ].join("\n");
    const result = await runHermesDailyMentor({ scoreSummary, weakestLanes }, env);

    return {
      ok: true,
      model: result.model,
      plan: result.plan,
      provider: result.provider,
    };
  } catch {
    console.error("generateDailyMentor failed; deterministic brief remains available.");
    return {
      ok: false,
      error: "Hermes is unavailable. Use the deterministic brief below and retry later.",
    };
  } finally {
    if (sql) await closeSqlClient(sql);
  }
}
