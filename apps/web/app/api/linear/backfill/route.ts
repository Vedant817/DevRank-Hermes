import { backfillLinear } from "@repo/linear";
import {
  closeSqlClient,
  createSqlClient,
  insertIngestionRun,
  upsertLinearBackfill,
} from "@repo/db";
import {
  getOptionalInteger,
  jsonError,
  jsonOk,
  methodNotAllowed,
  rateLimit,
  readJsonObject,
  requireApiAuth,
  sanitizeOperationalError,
} from "../../_lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const limitError = rateLimit(request, {
    key: "linear_backfill",
    limit: 10,
    windowMs: 60 * 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireApiAuth(request, {
    scopedEnvName: "DEVRANK_LINEAR_BACKFILL_TOKEN",
    label: "Linear backfill token",
  });

  if (authError !== null) {
    return authError;
  }

  const body = await readJsonObject(request, { maxBytes: 16 * 1024 });

  if (!body.ok) {
    return body.response;
  }

  const first = getOptionalInteger(body.value, "first", 100, 1, 500);

  if (!first.ok) {
    return first.response;
  }

  try {
    const result = await backfillLinear(first.value);
    const sql = createSqlClient();
    let written = { issues: 0, projects: 0 };

    try {
      written = await upsertLinearBackfill(sql, result);
      await insertIngestionRun(sql, {
        source: "linear_backfill",
        status: "success",
        summary: `Imported ${written.projects} Linear project(s) and ${written.issues} issue(s).`,
      });
    } finally {
      await closeSqlClient(sql);
    }

    return jsonOk({
      projectCount: result.projects.length,
      issueCount: result.issues.length,
      written,
      result,
    });
  } catch (error) {
    await recordLinearBackfillFailure(sanitizeOperationalError(error, "linear_backfill_failed"));

    return jsonError(503, "linear_backfill_failed", "Linear backfill failed.");
  }
}

async function recordLinearBackfillFailure(error: string): Promise<void> {
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    await insertIngestionRun(sql, {
      source: "linear_backfill",
      status: "failed",
      error,
    });
  } catch {
    // The public response already fails clearly; this best-effort audit cannot run without database access.
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}
