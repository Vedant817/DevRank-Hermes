#!/usr/bin/env node
import "dotenv/config";

import {
  closeSqlClient,
  createSqlClient,
  getHighestPriorityLinearPlanningIssue,
  getLatestScoreSnapshot,
  insertDailyPlan,
  insertScoreSnapshot,
  listEvidenceItems,
  listScoringEvidence,
} from "@repo/db";
import { generateDailyPlan, formatDailyPlanForSlack } from "@repo/planner";
import { computeSdeReadinessSnapshot, explainWeakestLanes } from "@repo/scoring";
import { runHermesMentorSummary } from "@repo/hermes";
import { runMarketBenchmark } from "@repo/search";
import { sendSlackMessage } from "@repo/slack";
import type { EvidenceItem } from "@repo/shared";

export async function runDailyPlanJob(evidence?: EvidenceItem[]) {
  if (evidence !== undefined) {
    if (evidence.length === 0) {
      throw new Error("Daily plan requires evidence. Run ingestion first.");
    }

    return createDailyPlanFromEvidence(evidence, false);
  }

  const sql = createSqlClient();

  try {
    let snapshot = await getLatestScoreSnapshot(sql);

    if (!snapshot) {
      const persistedEvidence = await listScoringEvidence(sql);

      if (persistedEvidence.length === 0) {
        throw new Error("Daily plan requires a score snapshot or persisted evidence. Run ingestion first.");
      }

      snapshot = computeSdeReadinessSnapshot(persistedEvidence);
      await insertScoreSnapshot(sql, snapshot);
    }

    const linearIssue = await getHighestPriorityLinearPlanningIssue(sql);
    const plan = generateDailyPlan(snapshot, {
      urgentLinearTask: linearIssue
        ? `Linear ${linearIssue.identifier}: ${linearIssue.title}`
        : undefined,
    });
    await insertDailyPlan(sql, plan);
    const slackText = formatDailyPlanForSlack(plan);

    if (process.env.SLACK_WEBHOOK_URL) {
      await sendSlackMessage(slackText);
    }

    return { snapshot, plan, linearIssue, slackText, stored: true };
  } finally {
    await closeSqlClient(sql);
  }
}

async function createDailyPlanFromEvidence(evidence: EvidenceItem[], stored: boolean) {
  const snapshot = computeSdeReadinessSnapshot(evidence);
  const plan = generateDailyPlan(snapshot);
  const slackText = formatDailyPlanForSlack(plan);

  if (process.env.SLACK_WEBHOOK_URL) {
    await sendSlackMessage(slackText);
  }

  return { snapshot, plan, slackText, stored };
}

export async function runWeeklyReviewJob(input?: {
  evidenceSummary?: string;
  weakestLanes?: string[];
}) {
  if (input?.evidenceSummary && input.weakestLanes && input.weakestLanes.length > 0) {
    return {
      review: await runHermesMentorSummary({
        evidenceSummary: input.evidenceSummary,
        weakestLanes: input.weakestLanes,
      }),
      weakestLanes: input.weakestLanes,
    };
  }

  const sql = createSqlClient();

  try {
    const evidence = await listEvidenceItems(sql, { limit: 100 });

    if (evidence.length === 0) {
      throw new Error("Weekly review requires persisted evidence. Run ingestion first.");
    }

    const snapshot = computeSdeReadinessSnapshot(evidence);
    const weakestLanes = explainWeakestLanes(snapshot);
    const evidenceSummary = evidence
      .slice(0, 25)
      .map((item) => `${item.title}: ${item.summary}`)
      .join("\n");

    return {
      review: await runHermesMentorSummary({
        evidenceSummary,
        weakestLanes,
      }),
      evidenceCount: evidence.length,
      weakestLanes,
    };
  } finally {
    await closeSqlClient(sql);
  }
}

export async function runMarketBenchmarkJob() {
  return runMarketBenchmark([
    "SDE fresher backend roles India",
    "Java Spring Boot backend roles India",
    "Node.js backend roles India",
    "AI agent engineer roles India",
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const job = process.argv[2];
  const runner =
    job === "daily-plan"
      ? () => runDailyPlanJob()
      : job === "weekly-review"
        ? () => runWeeklyReviewJob()
        : job === "market-benchmark"
          ? () => runMarketBenchmarkJob()
          : undefined;

  if (!runner) {
    console.error("Usage: worker <daily-plan|weekly-review|market-benchmark>");
    process.exitCode = 2;
  } else {
    runner()
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
