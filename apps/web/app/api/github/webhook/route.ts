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
  upsertGithubBackfill,
} from "@repo/db";
import {
  githubWebhookIngestion,
  isSupportedGithubWebhookEvent,
  verifyGithubWebhook,
} from "@repo/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const limitError = rateLimit(request, {
    key: "github_webhook",
    limit: 120,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const secret = getRequiredEnv("GITHUB_WEBHOOK_SECRET");

  if (!secret.ok) {
    return secret.response;
  }

  const rawBody = await readRawBody(request, { maxBytes: 1024 * 1024 });

  if (!rawBody.ok) {
    return rawBody.response;
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");

  try {
    await verifyGithubWebhook(rawBody.text, signatureHeader);
  } catch {
    return jsonError(401, "github_signature_invalid", "GitHub signature verification failed.");
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

  if (!isSupportedGithubWebhookEvent(event, action)) {
    return jsonOk(
      {
        ignored: true,
        reason: "unsupported_github_event",
        action,
        event,
        deliveryId,
      },
      202,
    );
  }

  const ingestion = githubWebhookIngestion(event, deliveryId ?? "unknown", payload.value);
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    const written = await upsertGithubBackfill(sql, ingestion.backfill);
    const writtenEvidence = await upsertEvidenceItems(sql, [{
      id: `github:webhook:${event}:${deliveryId ?? "unknown"}`,
      source: "github",
      title: `GitHub ${event}${action ? ` ${action}` : ""}`,
      summary: [
        `GitHub webhook ${event} was received.`,
        ingestion.summary.repository ? `Repository: ${ingestion.summary.repository}.` : "",
        ingestion.summary.pullRequestNumber ? `Pull request: #${ingestion.summary.pullRequestNumber}.` : "",
        action ? `Action: ${action}.` : "",
      ].filter(Boolean).join(" "),
      occurredAt: new Date().toISOString(),
      metadata: {
        action,
        deliveryId,
        event,
        repository: ingestion.summary.repository,
        pullRequestNumber: ingestion.summary.pullRequestNumber,
      },
    }]);

    await insertIngestionRun(sql, {
      source: "github_webhook",
      status: "success",
      summary: `Processed GitHub ${event} webhook with ${written.repos} repo(s), ${written.pullRequests} pull request(s), ${written.commits} commit(s), and ${writtenEvidence} evidence item(s).`,
    });

    return jsonOk({
      received: true,
      event,
      deliveryId,
      action,
      summary: ingestion.summary,
      written,
      writtenEvidence,
    });
  } catch (error) {
    if (sql) {
      await insertIngestionRun(sql, {
        source: "github_webhook",
        status: "failed",
        error: sanitizeOperationalError(error, "github_webhook_ingestion_failed"),
      }).catch(() => undefined);
    }

    return jsonError(503, "github_webhook_ingestion_failed", "GitHub webhook ingestion failed.");
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}
