import {
  containsLikelySecret,
  getOptionalObject,
  getOptionalString,
  getRequiredString,
  jsonError,
  jsonOk,
  methodNotAllowed,
  readJsonObject,
  requireApiAuth,
} from "../../_lib/route-utils";
import { writeContext } from "@repo/context";

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

  const summary = getRequiredString(body.value, "summary", 10_000);

  if (!summary.ok) {
    return summary.response;
  }

  if (containsLikelySecret(summary.value)) {
    return jsonError(422, "summary_contains_secret", "summary appears to contain a secret and cannot be written.");
  }

  const redactionStatus = getOptionalString(body.value, "redactionStatus");

  if (redactionStatus !== "passed") {
    return jsonError(400, "redaction_required", "redactionStatus must be passed before writing external context.", {
      field: "redactionStatus",
    });
  }

  const source = getRequiredString(body.value, "source", 200);

  if (!source.ok) {
    return source.response;
  }

  const scope = getOptionalObject(body.value, "scope");

  if (!scope.ok) {
    return scope.response;
  }

  const metadata = getOptionalObject(body.value, "metadata");

  if (!metadata.ok) {
    return metadata.response;
  }

  try {
    const item = await writeContext({
      title: getOptionalString(body.value, "title") ?? source.value,
      content: summary.value,
      source: source.value,
      containerTags: parseContainerTags(scope.value),
      metadata: metadata.value,
    });

    return jsonOk({ item });
  } catch (error) {
    return jsonError(503, "context_write_failed", error instanceof Error ? error.message : "Context write failed.");
  }
}

function parseContainerTags(scope: Record<string, unknown> | undefined): string[] | undefined {
  const tags = scope?.containerTags;

  if (!Array.isArray(tags)) {
    return undefined;
  }

  return tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
}
