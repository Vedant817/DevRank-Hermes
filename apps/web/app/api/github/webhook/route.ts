import {
  getRequiredEnv,
  jsonError,
  jsonOk,
  methodNotAllowed,
  packageUnavailable,
  parseWebhookJson,
  readRawBody,
} from "../../_lib/route-utils";
import { summarizeGithubWebhook, verifyGithubWebhook } from "@repo/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_EVENTS = new Set([
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "push",
]);

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const secret = getRequiredEnv("GITHUB_WEBHOOK_SECRET");

  if (!secret.ok) {
    return secret.response;
  }

  const rawBody = await readRawBody(request);
  const signatureHeader = request.headers.get("x-hub-signature-256");

  try {
    await verifyGithubWebhook(rawBody.text, signatureHeader);
  } catch (error) {
    return jsonError(401, "github_signature_invalid", error instanceof Error ? error.message : "GitHub signature verification failed.");
  }

  const payload = parseWebhookJson(rawBody.text);

  if (!payload.ok) {
    return payload.response;
  }

  const event = request.headers.get("x-github-event")?.trim();
  const deliveryId = request.headers.get("x-github-delivery")?.trim();
  const action = typeof payload.value.action === "string" ? payload.value.action : undefined;

  if (event === undefined || event.length === 0) {
    return methodNotAllowed(["GitHub webhook POST with x-github-event"]);
  }

  if (event === "ping") {
    return jsonOk({
      received: true,
      event,
      deliveryId,
    });
  }

  if (!SUPPORTED_EVENTS.has(event)) {
    return jsonOk(
      {
        ignored: true,
        reason: "unsupported_github_event",
        event,
        deliveryId,
      },
      202,
    );
  }

  return packageUnavailable("@repo/github", "GitHub webhook ingestion", {
    event,
    deliveryId,
    action,
    summary: summarizeGithubWebhook(event, deliveryId ?? "unknown", payload.value),
    secretConfigured: secret.value.length > 0,
  });
}
