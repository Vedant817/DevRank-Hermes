import { createHash } from "node:crypto";
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
  claimLinearWebhookDelivery,
  closeSqlClient,
  createSqlClient,
  deleteLinearEntities,
  insertIngestionRun,
  markLinearWebhookDeliveryFailed,
  markLinearWebhookDeliveryProcessed,
  reclaimLinearWebhookDelivery,
  runInTransaction,
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
  const limitError = await rateLimit(request, {
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

  const deliveryId = request.headers.get("linear-delivery")?.trim()
    || linearReplayKey(payload.value, rawBody.text);
  const eventType = request.headers.get("linear-event")?.trim()
    || (typeof payload.value.type === "string" ? payload.value.type : undefined);
  const action = typeof payload.value.action === "string" ? payload.value.action : undefined;
  const ageMs = Math.abs(Date.now() - webhookTimestamp);
  let sql: ReturnType<typeof createSqlClient> | undefined;
  let deliveryClaimed = false;

  try {
    sql = createSqlClient();
    const delivery = {
      action,
      deliveryId,
      eventType,
      webhookTimestamp: new Date(webhookTimestamp).toISOString(),
    };

    deliveryClaimed = ageMs <= MAX_WEBHOOK_AGE_MS
      ? await claimLinearWebhookDelivery(sql, delivery)
      : await reclaimLinearWebhookDelivery(sql, delivery);

    if (ageMs > MAX_WEBHOOK_AGE_MS && !deliveryClaimed) {
      return jsonError(401, "linear_timestamp_stale", "Linear webhook timestamp is outside the allowed replay window.", {
        maxAgeMs: MAX_WEBHOOK_AGE_MS,
        observedAgeMs: ageMs,
      });
    }

    if (!deliveryClaimed) {
      return jsonOk(
        {
          duplicate: true,
          received: true,
          eventType,
          action,
          deliveryId,
        },
        202,
      );
    }

    const ingestion = linearWebhookIngestion(payload.value);
    const persisted = await runInTransaction(sql, async (transaction) => {
      const deleted = await deleteLinearEntities(transaction, ingestion.deletions);
      const written = await upsertLinearBackfill(transaction, ingestion.backfill);
      const writtenEvidence = await upsertEvidenceItems(transaction, [{
        id: `linear:webhook:${eventType ?? "unknown"}:${deliveryId}`,
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

      await markLinearWebhookDeliveryProcessed(transaction, deliveryId);
      await insertIngestionRun(transaction, {
        source: "linear_webhook",
        status: "success",
        summary: `Processed Linear ${eventType ?? "event"} webhook with ${written.projects} project(s), ${written.issues} issue(s), ${deleted.projects} deleted project(s), ${deleted.issues} deleted issue(s), and ${writtenEvidence} evidence item(s).`,
      });

      return { deleted, written, writtenEvidence };
    });

    return jsonOk({
      received: true,
      eventType,
      action,
      deliveryId,
      summary: ingestion.summary,
      ...persisted,
    });
  } catch (error) {
    if (sql) {
      if (deliveryClaimed) {
        await markLinearWebhookDeliveryFailed(
          sql,
          deliveryId,
          sanitizeOperationalError(error, "linear_webhook_ingestion_failed"),
        ).catch(() => undefined);
      }

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

function linearReplayKey(payload: Record<string, unknown>, rawBody: string) {
  const webhookId = typeof payload.webhookId === "string" ? payload.webhookId : "unknown-webhook";
  const eventType = typeof payload.type === "string" ? payload.type : "event";
  const action = typeof payload.action === "string" ? payload.action : "action";
  const timestamp = typeof payload.webhookTimestamp === "number"
    ? String(payload.webhookTimestamp)
    : "unknown-time";
  const entityId = linearEntityId(payload.data);
  const digest = createHash("sha256").update(rawBody).digest("hex").slice(0, 24);

  return [
    "payload",
    webhookId,
    timestamp,
    eventType,
    action,
    entityId ?? digest,
  ].join(":");
}

function linearEntityId(value: unknown) {
  return typeof value === "object"
    && value !== null
    && "id" in value
    && typeof value.id === "string"
    ? value.id
    : undefined;
}
