import {
  closeSqlClient,
  claimSlackNotificationAttempt,
  createSqlClient,
  getLinearPlanningSignal,
  getLatestScoreSnapshot,
  insertDailyPlan,
  markSlackNotificationDelivered,
  markSlackNotificationFailed,
} from "@repo/db";
import { sendSlackMessage } from "@repo/slack";
import {
  getOptionalString,
  getRequiredEnv,
  isJsonObject,
  jsonError,
  jsonOk,
  methodNotAllowed,
  rateLimit,
  readJsonObject,
  requireApiAuth,
  requireCronAuth,
} from "../../_lib/route-utils";
import {
  formatDailyPlanForSlack,
  generateDailyPlan,
} from "@repo/planner";
import { ensureCurrentScoreSnapshot } from "../../../_lib/current-score";
import { dailyPlanCronSchedule } from "../_lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScoreSnapshot = Parameters<typeof generateDailyPlan>[0];
type ScoreBreakdown = ScoreSnapshot["breakdown"][number];

export async function GET(request: Request) {
  const limitError = await rateLimit(request, {
    key: "daily_plan_cron",
    limit: 5,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireCronAuth(request);

  if (authError !== null) {
    return authError;
  }

  try {
    const sql = createSqlClient();

    try {
      const latestSnapshot = await getLatestScoreSnapshot(sql);
      const currentScore = await ensureCurrentScoreSnapshot(sql, latestSnapshot);

      if (!currentScore.snapshot) {
        return jsonError(422, "evidence_required", "No current score snapshot or persisted evidence exists. Run ingestion first.");
      }

      const linearSignal = await getLinearPlanningSignal(sql);
      const plan = generateDailyPlan(currentScore.snapshot, {
        linearSyncWarning: linearSignal.syncHealth.status === "failed"
          ? linearSignal.syncHealth.message
          : undefined,
        urgentLinearTask: linearSignal.issue
          ? `Linear ${linearSignal.issue.identifier}: ${linearSignal.issue.title}`
          : undefined,
      });
      await insertDailyPlan(sql, plan);
      const slackText = formatDailyPlanForSlack(plan);
      const slackEnv = getRequiredEnv("SLACK_WEBHOOK_URL");

      if (!slackEnv.ok) {
        return slackEnv.response;
      }

      const notification = await claimSlackNotificationAttempt(sql, {
        deliveryKey: `daily-plan:${plan.date}`,
        text: slackText,
        response: {
          planDate: plan.date,
          source: "daily_plan_cron",
          status: "pending",
        },
      });
      const notificationId = notification.id;

      if (!notification.claimed) {
        return jsonOk({
          plan,
          cron: dailyPlanCronSchedule,
          linearIssue: linearSignal.issue,
          linearSyncHealth: linearSignal.syncHealth,
          scoreSnapshotStatus: currentScore.status,
          slackText,
          slackDelivered: notification.status === "delivered",
          slackDuplicate: true,
          slackNotificationId: notificationId,
          slackNotificationRecorded: true,
        });
      }

      let slack: Awaited<ReturnType<typeof sendSlackMessage>>;
      let notificationRecorded = true;

      try {
        slack = await sendSlackMessage(slackText);
      } catch {
        await markSlackNotificationFailed(sql, {
          id: notificationId,
          errorCode: "slack_delivery_failed",
          response: {
            planDate: plan.date,
            source: "daily_plan_cron",
          },
        }).catch(() => undefined);

        return jsonError(502, "slack_delivery_failed", "Slack delivery failed.");
      }

      try {
        await markSlackNotificationDelivered(sql, {
          id: notificationId,
          deliveredAt: slack.deliveredAt,
          response: {
            deliveredAt: slack.deliveredAt,
            planDate: plan.date,
            provider: "slack_webhook",
            source: "daily_plan_cron",
            status: "delivered",
          },
        });
      } catch {
        notificationRecorded = false;
      }

      return jsonOk({
        plan,
        cron: dailyPlanCronSchedule,
        linearIssue: linearSignal.issue,
        linearSyncHealth: linearSignal.syncHealth,
        scoreSnapshotStatus: currentScore.status,
        slackText,
        slackDelivered: true,
        slackNotificationId: notificationId,
        slackNotificationRecorded: notificationRecorded,
        slack,
      });
    } finally {
      await closeSqlClient(sql);
    }
  } catch {
    return jsonError(503, "daily_plan_failed", "Daily plan generation failed.");
  }
}

export async function POST(request: Request) {
  const limitError = await rateLimit(request, {
    key: "daily_plan_preview",
    limit: 20,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireApiAuth(request, {
    scopedEnvName: "DEVRANK_PLANNER_TOKEN",
    label: "planner token",
  });

  if (authError !== null) {
    return authError;
  }

  const body = await readJsonObject(request, { maxBytes: 128 * 1024 });

  if (!body.ok) {
    return body.response;
  }

  const snapshot = parseScoreSnapshot(body.value.snapshot);

  if (!snapshot.ok) {
    return snapshot.response;
  }

  const date = getOptionalString(body.value, "date");

  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError(400, "invalid_date", "date must use YYYY-MM-DD format.", {
      field: "date",
    });
  }

  const urgentLinearTask = getOptionalString(body.value, "urgentLinearTask");
  const linearSyncWarning = getOptionalString(body.value, "linearSyncWarning");
  const plan = generateDailyPlan(snapshot.value, {
    date,
    linearSyncWarning,
    urgentLinearTask,
  });
  const slackText = formatDailyPlanForSlack(plan);

  return jsonOk({
    plan,
    slackText,
  });
}

function parseScoreSnapshot(value: unknown) {
  if (!isJsonObject(value)) {
    return {
      ok: false as const,
      response: jsonError(400, "missing_field", "snapshot is required.", {
        field: "snapshot",
      }),
    };
  }

  if (typeof value.overall !== "number" || value.overall < 0 || value.overall > 100) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_snapshot", "snapshot.overall must be a number from 0 to 100."),
    };
  }

  if (typeof value.generatedAt !== "string" || value.generatedAt.trim().length === 0) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_snapshot", "snapshot.generatedAt is required."),
    };
  }

  if (typeof value.rubricVersion !== "string" || value.rubricVersion.trim().length === 0) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_snapshot", "snapshot.rubricVersion is required."),
    };
  }

  if (!Array.isArray(value.breakdown)) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_snapshot", "snapshot.breakdown must be an array."),
    };
  }

  const breakdown: ScoreBreakdown[] = [];

  for (const [index, item] of value.breakdown.entries()) {
    const parsed = parseScoreBreakdown(item, index);

    if (!parsed.ok) {
      return parsed;
    }

    breakdown.push(parsed.value);
  }

  return {
    ok: true as const,
    value: {
      overall: value.overall,
      generatedAt: value.generatedAt,
      breakdown,
      rubricVersion: value.rubricVersion,
    },
  };
}

function parseScoreBreakdown(value: unknown, index: number) {
  if (!isJsonObject(value)) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_snapshot", "Each breakdown item must be a JSON object.", {
        index,
      }),
    };
  }

  if (
    typeof value.label !== "string" ||
    typeof value.score !== "number" ||
    typeof value.weight !== "number" ||
    typeof value.evidenceCount !== "number" ||
    typeof value.explanation !== "string"
  ) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_snapshot", "Breakdown items must include label, score, weight, evidenceCount, and explanation.", {
        index,
      }),
    };
  }

  return {
    ok: true as const,
    value: {
      label: value.label,
      score: value.score,
      weight: value.weight,
      evidenceCount: value.evidenceCount,
      explanation: value.explanation,
    },
  };
}

export function PUT() {
  return methodNotAllowed(["GET", "POST"]);
}
