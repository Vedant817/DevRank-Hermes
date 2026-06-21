#!/usr/bin/env node
import "dotenv/config";

import { generateDailyPlan, formatDailyPlanForSlack } from "@repo/planner";
import { computeSdeReadinessSnapshot } from "@repo/scoring";
import { runHermesMentorSummary } from "@repo/hermes";
import { runMarketBenchmark } from "@repo/search";
import { sendSlackMessage } from "@repo/slack";
import type { EvidenceItem } from "@repo/shared";

export async function runDailyPlanJob(evidence: EvidenceItem[] = []) {
  const snapshot = computeSdeReadinessSnapshot(evidence);
  const plan = generateDailyPlan(snapshot);
  const slackText = formatDailyPlanForSlack(plan);

  if (process.env.SLACK_WEBHOOK_URL) {
    await sendSlackMessage(slackText);
  }

  return { snapshot, plan, slackText };
}

export async function runWeeklyReviewJob(input: {
  evidenceSummary: string;
  weakestLanes: string[];
}) {
  return runHermesMentorSummary(input);
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
        ? () => runWeeklyReviewJob({ evidenceSummary: "", weakestLanes: [] })
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
