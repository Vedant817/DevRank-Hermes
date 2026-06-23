import {
  closeSqlClient,
  createSqlClient,
  getHighestPriorityLinearPlanningIssue,
  getLatestScoreSnapshot,
  insertDailyPlan,
  insertScoreSnapshot,
  listScoringEvidence,
} from "@repo/db";
import { computeSdeReadinessSnapshot } from "@repo/scoring";
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
import { dailyPlanCronSchedule } from "../_lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScoreSnapshot = Parameters<typeof generateDailyPlan>[0];
type ScoreBreakdown = ScoreSnapshot["breakdown"][number];

export async function GET(request: Request) {
  const limitError = rateLimit(request, {
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
      let snapshot = await getLatestScoreSnapshot(sql);

      if (!snapshot) {
        const evidence = await listScoringEvidence(sql);

        if (evidence.length === 0) {
          return jsonError(422, "evidence_required", "No persisted evidence exists yet. Run ingestion first.");
        }

        snapshot = computeSdeReadinessSnapshot(evidence);
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
      const slackEnv = getRequiredEnv("SLACK_WEBHOOK_URL");

      if (!slackEnv.ok) {
        return slackEnv.response;
      }

      const slack = await sendSlackMessage(slackText);

      return jsonOk({
        plan,
        cron: dailyPlanCronSchedule,
        linearIssue,
        slackText,
        slackDelivered: true,
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
  const limitError = rateLimit(request, {
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
  const plan = generateDailyPlan(snapshot.value, date, urgentLinearTask);
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
