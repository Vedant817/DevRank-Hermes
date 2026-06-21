import {
  getRequiredEnv,
  jsonError,
  methodNotAllowed,
  packageUnavailable,
  parseWebhookJson,
  readRawBody,
} from "../../_lib/route-utils";
import { summarizeLinearWebhook, verifyLinearWebhook } from "@repo/linear";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_AGE_MS = 60_000;

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const secret = getRequiredEnv("LINEAR_WEBHOOK_SECRET");

  if (!secret.ok) {
    return secret.response;
  }

  const rawBody = await readRawBody(request);
  const signatureHeader = request.headers.get("linear-signature");

  try {
    verifyLinearWebhook(rawBody.text, signatureHeader);
  } catch (error) {
    return jsonError(401, "linear_signature_invalid", error instanceof Error ? error.message : "Linear signature verification failed.");
  }

  const payload = parseWebhookJson(rawBody.text);

  if (!payload.ok) {
    return payload.response;
  }

  const webhookTimestamp = payload.value.webhookTimestamp;

  if (typeof webhookTimestamp !== "number" || !Number.isFinite(webhookTimestamp)) {
    return jsonError(400, "linear_timestamp_missing", "webhookTimestamp must be present in the Linear payload.");
  }

  const ageMs = Math.abs(Date.now() - webhookTimestamp);

  if (ageMs > MAX_WEBHOOK_AGE_MS) {
    return jsonError(401, "linear_timestamp_stale", "Linear webhook timestamp is outside the allowed replay window.", {
      maxAgeMs: MAX_WEBHOOK_AGE_MS,
      observedAgeMs: ageMs,
    });
  }

  const deliveryId = request.headers.get("linear-delivery")?.trim();
  const eventType = typeof payload.value.type === "string" ? payload.value.type : undefined;
  const action = typeof payload.value.action === "string" ? payload.value.action : undefined;

  return packageUnavailable("@repo/linear", "Linear webhook ingestion", {
    eventType,
    action,
    deliveryId,
    summary: summarizeLinearWebhook(payload.value),
    secretConfigured: secret.value.length > 0,
  });
}
