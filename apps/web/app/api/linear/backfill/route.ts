import { backfillLinear } from "@repo/linear";
import {
  getOptionalInteger,
  jsonError,
  jsonOk,
  methodNotAllowed,
  readJsonObject,
  requireApiAuth,
} from "../../_lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const authError = requireApiAuth(request);

  if (authError !== null) {
    return authError;
  }

  const body = await readJsonObject(request);

  if (!body.ok) {
    return body.response;
  }

  const first = getOptionalInteger(body.value, "first", 100, 1, 500);

  if (!first.ok) {
    return first.response;
  }

  try {
    const result = await backfillLinear(first.value);

    return jsonOk({
      projectCount: result.projects.length,
      issueCount: result.issues.length,
      result,
    });
  } catch (error) {
    return jsonError(503, "linear_backfill_failed", error instanceof Error ? error.message : "Linear backfill failed.");
  }
}
