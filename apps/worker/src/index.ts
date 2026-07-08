#!/usr/bin/env node
import "dotenv/config";

import {
  closeSqlClient,
  claimSlackNotificationAttempt,
  createSqlClient,
  dailyTaskKey,
  getHighestPriorityLinearPlanningIssue,
  getLatestBenchmarkSnapshot,
  getLatestScoreSnapshot,
  insertBenchmarkSnapshot,
  insertDailyPlan,
  insertScoreSnapshot,
  listDsaQuestionBank,
  listEvidenceItems,
  listOutcomeEvents,
  listScoringEvidence,
  listSkillEvidence,
  markSlackNotificationDelivered,
  markSlackNotificationFailed,
  type SqlClient,
} from "@repo/db";
import { generateDailyPlan, formatDailyPlanForSlack } from "@repo/planner";
import {
  applyMarketWeightAdjustment,
  buildDirectionalOutcomeReport,
  computeSdeReadinessSnapshot,
  explainWeakestLanes,
  isCurrentSdeReadinessSnapshot,
} from "@repo/scoring";
import { runHermesMentorSummary } from "@repo/hermes";
import { runMarketBenchmark } from "@repo/search";
import {
  sendDailyPlanToSlack,
  type TaskActionItem,
} from "@repo/slack";
import type { DailyPlan as SharedDailyPlan } from "@repo/shared";
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
    let scoreSnapshotStatus = "current";

    if (!snapshot || !isCurrentSdeReadinessSnapshot(snapshot)) {
      const hadStaleSnapshot = snapshot !== undefined;
      const persistedEvidence = await listScoringEvidence(sql);

      if (persistedEvidence.length === 0) {
        throw new Error(
          hadStaleSnapshot
            ? "Daily plan found a stale score snapshot but no persisted evidence to refresh it."
            : "Daily plan requires a score snapshot or persisted evidence. Run ingestion first.",
        );
      }

      snapshot = computeSdeReadinessSnapshot(persistedEvidence);
      await insertScoreSnapshot(sql, snapshot);
      scoreSnapshotStatus = hadStaleSnapshot ? "refreshed" : "created";
    }

    const linearIssue = await getHighestPriorityLinearPlanningIssue(sql);
    const dsaQuestionBank = await listDsaQuestionBank(sql).catch(() => []);
    const latestBenchmark = await getLatestBenchmarkSnapshot(sql).catch(() => undefined);
    const plan = generateDailyPlan(snapshot, {
      benchmarkSkillGap: latestBenchmark
        ? {
            missingSkills: latestBenchmark.missingSkills,
            weeklyLearningPriorities: latestBenchmark.weeklyLearningPriorities,
            skillFrequency: latestBenchmark.skillFrequency,
          }
        : undefined,
      dsaQuestionBank,
      urgentLinearTask: linearIssue
        ? `Linear ${linearIssue.identifier}: ${linearIssue.title}`
        : undefined,
    });
    await insertDailyPlan(sql, plan);
    const slackText = formatDailyPlanForSlack(plan);
    const slackDelivery = await sendAuditedDailyPlanSlack(sql, plan, "daily_plan_worker");

    return { snapshot, plan, linearIssue, scoreSnapshotStatus, ...slackDelivery, slackText, stored: true };
  } finally {
    await closeSqlClient(sql);
  }
}

async function createDailyPlanFromEvidence(evidence: EvidenceItem[], stored: boolean) {
  const snapshot = computeSdeReadinessSnapshot(evidence);
  const plan = generateDailyPlan(snapshot);
  const slackText = formatDailyPlanForSlack(plan);

  return { snapshot, plan, slackDelivered: false, slackText, stored };
}

async function sendAuditedDailyPlanSlack(
  sql: SqlClient,
  plan: SharedDailyPlan,
  source: string,
) {
  const taskItems: TaskActionItem[] = plan.tasks.map((task) => ({
    date: plan.date,
    taskKey: dailyTaskKey(plan.date, task),
    title: task.title,
    minutes: task.minutes,
    evidence: task.evidence,
  }));
  const text = taskItems.map((t, i) => `${i + 1}. ${t.title} (${t.minutes} min)`).join("\n");
  const notification = await claimSlackNotificationAttempt(sql, {
    deliveryKey: `daily-plan:${plan.date}`,
    text,
    response: {
      planDate: plan.date,
      source,
      status: "pending",
    },
  });
  const notificationId = notification.id;

  if (!notification.claimed) {
    return {
      slackDelivered: notification.status === "delivered",
      slackDuplicate: true,
      slackNotificationId: notificationId,
      slackNotificationRecorded: true,
    };
  }

  let result: Awaited<ReturnType<typeof sendDailyPlanToSlack>>;

  try {
    result = await sendDailyPlanToSlack(taskItems);
  } catch (error) {
    await markSlackNotificationFailed(sql, {
      id: notificationId,
      errorCode: "slack_delivery_failed",
      response: {
        planDate: plan.date,
        source,
      },
    }).catch(() => undefined);

    throw error;
  }

  let slackNotificationRecorded = true;

  try {
    await markSlackNotificationDelivered(sql, {
      id: notificationId,
      deliveredAt: result.deliveredAt,
      response: {
        deliveredAt: result.deliveredAt,
        planDate: plan.date,
        provider: result.method === "blocks" ? "slack_blocks" : "slack_webhook",
        source,
        status: "delivered",
      },
    });
  } catch {
    slackNotificationRecorded = false;
  }

  return {
    slackDelivered: true,
    slackMethod: result.method,
    slackNotificationId: notificationId,
    slackNotificationRecorded,
  };
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

    const latestBenchmark = await getLatestBenchmarkSnapshot(sql).catch(() => undefined);
    const rubricOverride = latestBenchmark
      ? applyMarketWeightAdjustment(undefined, {
          generatedAt: latestBenchmark.generatedAt,
          queries: latestBenchmark.queries,
          repeatedSkills: [], // populated from frequency if needed
          results: [],
          skillFrequency: latestBenchmark.skillFrequency,
          missingSkills: latestBenchmark.missingSkills,
          resumeKeywordGaps: latestBenchmark.resumeKeywordGaps,
          weeklyLearningPriorities: latestBenchmark.weeklyLearningPriorities,
        })
      : undefined;

    const snapshot = computeSdeReadinessSnapshot(evidence, undefined, rubricOverride);
    const weakestLanes = explainWeakestLanes(snapshot);
    const evidenceSummary = evidence
      .slice(0, 25)
      .map((item) => `${item.title}: ${item.summary}`)
      .join("\n");

    const scoreHistory = await getLatestScoreSnapshot(sql).then((s) => s ? [s] : []).catch(() => []);
    const outcomeEvents = await listOutcomeEvents(sql, { limit: 50 }).catch(() => []);
    const outcomeReport = buildDirectionalOutcomeReport({
      scoreSnapshots: [...scoreHistory, snapshot].map((s) => ({
        overall: s.overall,
        generatedAt: s.generatedAt,
      })),
      outcomeEvents: outcomeEvents.map((e) => ({
        eventType: e.eventType,
        occurredAt: e.occurredAt,
        company: e.company,
        role: e.role,
      })),
    });

    await insertScoreSnapshot(sql, snapshot);

    return {
      review: await runHermesMentorSummary({
        evidenceSummary,
        weakestLanes,
      }),
      evidenceCount: evidence.length,
      weakestLanes,
      snapshot,
      rubricAdjusted: rubricOverride !== undefined,
      outcomeReport,
    };
  } finally {
    await closeSqlClient(sql);
  }
}

export async function runMarketBenchmarkJob() {
  const sql = createSqlClient();

  try {
    const ownedSlugs = await listSkillEvidence(sql, { limit: 5000 })
      .then((rows) => [...new Set(rows.map((r) => r.skillSlug))])
      .catch(() => undefined);

    const result = await runMarketBenchmark(
      [
        "SDE fresher backend roles India",
        "Java Spring Boot backend roles India",
        "Node.js backend roles India",
        "AI agent engineer roles India",
      ],
      undefined,
      ownedSlugs ? { ownedSkillSlugs: ownedSlugs } : {},
    );

    await insertBenchmarkSnapshot(sql, {
      generatedAt: result.generatedAt,
      queries: result.queries,
      skillFrequency: result.skillFrequency,
      missingSkills: result.missingSkills,
      resumeKeywordGaps: result.resumeKeywordGaps,
      weeklyLearningPriorities: result.weeklyLearningPriorities,
      rawResults: result.results,
    });

    return { ...result, persisted: true };
  } finally {
    await closeSqlClient(sql);
  }
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
