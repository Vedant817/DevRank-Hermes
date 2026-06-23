import {
  closeSqlClient,
  createSqlClient,
  listEvidenceItems,
} from "@repo/db";
import { computeSdeReadinessSnapshot, explainWeakestLanes } from "@repo/scoring";
import {
  getRequiredString,
  jsonError,
  jsonOk,
  methodNotAllowed,
  parseOptionalStringArray,
  rateLimit,
  readJsonObject,
  requireApiAuth,
  requireCronAuth,
} from "../../_lib/route-utils";
import { runHermesMentorSummary } from "@repo/hermes";
import { weeklyReviewCronSchedule } from "../_lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limitError = rateLimit(request, {
    key: "weekly_review_cron",
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
      const evidence = await listEvidenceItems(sql, { limit: 100 });

      if (evidence.length === 0) {
        return jsonError(422, "evidence_required", "No persisted evidence exists yet. Run ingestion first.");
      }

      const snapshot = computeSdeReadinessSnapshot(evidence);
      const weakestLanes = explainWeakestLanes(snapshot);
      const evidenceSummary = evidence
        .slice(0, 25)
        .map((item) => `${item.title}: ${item.summary}`)
        .join("\n");
      const review = await runHermesMentorSummary({
        evidenceSummary,
        weakestLanes,
      });

      return jsonOk({
        review,
        cron: weeklyReviewCronSchedule,
        evidenceCount: evidence.length,
        weakestLanes,
      });
    } finally {
      await closeSqlClient(sql);
    }
  } catch {
    return jsonError(503, "weekly_review_failed", "Weekly review failed.");
  }
}

export async function POST(request: Request) {
  const limitError = rateLimit(request, {
    key: "weekly_review_preview",
    limit: 10,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireApiAuth(request, {
    scopedEnvName: "DEVRANK_HERMES_REVIEW_TOKEN",
    label: "Hermes review token",
  });

  if (authError !== null) {
    return authError;
  }

  const body = await readJsonObject(request, { maxBytes: 128 * 1024 });

  if (!body.ok) {
    return body.response;
  }

  const evidenceSummary = getRequiredString(body.value, "evidenceSummary", 20_000);

  if (!evidenceSummary.ok) {
    return evidenceSummary.response;
  }

  const weakestLanes = parseOptionalStringArray(body.value.weakestLanes, {
    field: "weakestLanes",
    maxItems: 10,
    maxLength: 80,
  });

  if (!weakestLanes.ok) {
    return weakestLanes.response;
  }

  if (weakestLanes.value === undefined) {
    return jsonError(400, "invalid_weakest_lanes", "weakestLanes must be a non-empty array of strings.");
  }

  try {
    const result = await runHermesMentorSummary({
      evidenceSummary: evidenceSummary.value,
      weakestLanes: weakestLanes.value,
    });

    return jsonOk({ review: result });
  } catch {
    return jsonError(503, "weekly_review_failed", "Weekly review failed.");
  }
}

export function PUT() {
  return methodNotAllowed(["GET", "POST"]);
}
