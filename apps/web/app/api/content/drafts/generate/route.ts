import {
  closeSqlClient,
  createSqlClient,
  generateAndStoreCareerContentDrafts,
} from "@repo/db";
import {
  jsonError,
  jsonOk,
  methodNotAllowed,
  rateLimit,
  requireApiAuth,
} from "../../../_lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limitError = rateLimit(request, {
    key: "content_drafts_generate",
    limit: 10,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireApiAuth(request, {
    label: "content generation token",
  });

  if (authError !== null) {
    return authError;
  }

  try {
    const sql = createSqlClient();

    try {
      const dashboard = await generateAndStoreCareerContentDrafts(sql);

      return jsonOk({
        drafts: dashboard.drafts,
        totals: dashboard.totals,
      });
    } finally {
      await closeSqlClient(sql);
    }
  } catch {
    return jsonError(503, "content_generation_failed", "Career content draft generation failed.");
  }
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export function PUT() {
  return methodNotAllowed(["POST"]);
}

export function DELETE() {
  return methodNotAllowed(["POST"]);
}
