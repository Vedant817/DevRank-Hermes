import {
  getOptionalInteger,
  getOptionalObject,
  getRequiredString,
  jsonError,
  jsonOk,
  methodNotAllowed,
  readJsonObject,
  requireApiAuth,
} from "../../_lib/route-utils";
import { searchContext } from "@repo/context";

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

  const query = getRequiredString(body.value, "query", 1_000);

  if (!query.ok) {
    return query.response;
  }

  const limit = getOptionalInteger(body.value, "limit", 5, 1, 25);

  if (!limit.ok) {
    return limit.response;
  }

  const scope = getOptionalObject(body.value, "scope");

  if (!scope.ok) {
    return scope.response;
  }

  try {
    const results = await searchContext({
      query: query.value,
      limit: limit.value,
      containerTags: parseContainerTags(scope.value),
    });

    return jsonOk({ results });
  } catch (error) {
    return jsonError(503, "context_search_failed", error instanceof Error ? error.message : "Context search failed.");
  }
}

function parseContainerTags(scope: Record<string, unknown> | undefined): string[] | undefined {
  const tags = scope?.containerTags;

  if (!Array.isArray(tags)) {
    return undefined;
  }

  return tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
}
