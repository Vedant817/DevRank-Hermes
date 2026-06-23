import {
  containsLikelySecretInJson,
  containsLikelySecret,
  getOptionalObject,
  getOptionalString,
  getRequiredString,
  jsonError,
  jsonOk,
  methodNotAllowed,
  parseOptionalStringArray,
  rateLimit,
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
  const limitError = rateLimit(request, {
    key: "context_write",
    limit: 30,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireApiAuth(request, {
    scopedEnvName: "DEVRANK_CONTEXT_WRITE_TOKEN",
    label: "context write token",
  });

  if (authError !== null) {
    return authError;
  }

  const body = await readJsonObject(request, { maxBytes: 64 * 1024 });

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

  const containerTags = parseContainerTags(scope.value);

  if (!containerTags.ok) {
    return containerTags.response;
  }

  if (containsLikelySecretInJson({
    metadata: metadata.value,
    scope: scope.value,
    source: source.value,
    title: getOptionalString(body.value, "title"),
  })) {
    return jsonError(422, "context_contains_secret", "Context fields appear to contain a secret and cannot be written.");
  }

  try {
    const item = await writeContext({
      title: getOptionalString(body.value, "title") ?? source.value,
      content: summary.value,
      source: source.value,
      containerTags: containerTags.value,
      metadata: metadata.value,
    });

    return jsonOk({ item });
  } catch {
    return jsonError(503, "context_write_failed", "Context write failed.");
  }
}

function parseContainerTags(scope: Record<string, unknown> | undefined) {
  return parseOptionalStringArray(scope?.containerTags, {
    field: "scope.containerTags",
    maxItems: 10,
    maxLength: 64,
  });
}
