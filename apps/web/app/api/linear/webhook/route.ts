import {
  getRequiredEnv,
  jsonError,
  jsonOk,
  methodNotAllowed,
  parseWebhookJson,
  rateLimit,
  readRawBody,
  sanitizeOperationalError,
} from "../../_lib/route-utils";
import {
  closeSqlClient,
  createSqlClient,
  insertIngestionRun,
  upsertEvidenceItems,
  upsertLinearBackfill,
} from "@repo/db";
import { linearWebhookIngestion, verifyLinearWebhook } from "@repo/linear";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_AGE_MS = 60_000;

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const limitError = rateLimit(request, {
    key: "linear_webhook",
    limit: 120,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const secret = getRequiredEnv("LINEAR_WEBHOOK_SECRET");

  if (!secret.ok) {
    return secret.response;
  }

  const rawBody = await readRawBody(request, { maxBytes: 1024 * 1024 });

  if (!rawBody.ok) {
    return rawBody.response;
  }

  const signatureHeader = request.headers.get("linear-signature");

  try {
    verifyLinearWebhook(rawBody.text, signatureHeader);
  } catch {
    return jsonError(401, "linear_signature_invalid", "Linear signature verification failed.");
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
  const ingestion = linearWebhookIngestion(payload.value);
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    const written = await upsertLinearBackfill(sql, ingestion.backfill);
    const writtenEvidence = await upsertEvidenceItems(sql, [{
      id: `linear:webhook:${eventType ?? "unknown"}:${deliveryId ?? String(webhookTimestamp)}`,
      source: "linear",
      title: `Linear ${eventType ?? "event"}${action ? ` ${action}` : ""}`,
      summary: [
        `Linear webhook ${eventType ?? "event"} was received.`,
        action ? `Action: ${action}.` : "",
        ingestion.summary.url ? `URL: ${ingestion.summary.url}.` : "",
      ].filter(Boolean).join(" "),
      occurredAt: new Date(webhookTimestamp).toISOString(),
      metadata: {
        action,
        deliveryId,
        eventType,
        organizationId: ingestion.summary.organizationId,
        url: ingestion.summary.url,
      },
    }]);

    await insertIngestionRun(sql, {
      source: "linear_webhook",
      status: "success",
      summary: `Processed Linear ${eventType ?? "event"} webhook with ${written.projects} project(s), ${written.issues} issue(s), and ${writtenEvidence} evidence item(s).`,
    });

    return jsonOk({
      received: true,
      eventType,
      action,
      deliveryId,
      summary: ingestion.summary,
      written,
      writtenEvidence,
    });
  } catch (error) {
    if (sql) {
      await insertIngestionRun(sql, {
        source: "linear_webhook",
        status: "failed",
        error: sanitizeOperationalError(error, "linear_webhook_ingestion_failed"),
      }).catch(() => undefined);
    }

    return jsonError(503, "linear_webhook_ingestion_failed", "Linear webhook ingestion failed.");
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}
