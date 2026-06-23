import {
  containsLikelySecret,
  getRequiredEnv,
  jsonError,
  jsonOk,
  methodNotAllowed,
  rateLimit,
  readJsonObject,
  requireApiAuth,
} from "../../_lib/route-utils";
import {
  closeSqlClient,
  createSlackNotificationAttempt,
  createSqlClient,
  markSlackNotificationDelivered,
  markSlackNotificationFailed,
} from "@repo/db";
import { sendSlackMessage } from "@repo/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const limitError = rateLimit(request, {
    key: "slack_send",
    limit: 20,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireApiAuth(request, {
    scopedEnvName: "DEVRANK_SLACK_SEND_TOKEN",
    label: "Slack send token",
  });

  if (authError !== null) {
    return authError;
  }

  const webhookUrl = getRequiredEnv("SLACK_WEBHOOK_URL");

  if (!webhookUrl.ok) {
    return webhookUrl.response;
  }

  const body = await readJsonObject(request, { maxBytes: 16 * 1024 });

  if (!body.ok) {
    return body.response;
  }

  const text = typeof body.value.text === "string" ? body.value.text.trim() : undefined;

  if (text === undefined || text.length === 0) {
    return jsonError(400, "slack_message_missing", "Provide text for the Slack message.");
  }

  if (text !== undefined && text.length > 4_000) {
    return jsonError(400, "slack_text_too_long", "Slack text must be 4000 characters or fewer.", {
      maxLength: 4_000,
    });
  }

  if (containsLikelySecret(text)) {
    return jsonError(422, "slack_text_contains_secret", "Slack text appears to contain a secret and cannot be sent.");
  }

  let sql: ReturnType<typeof createSqlClient> | undefined;
  let notificationId: string | undefined;
  let sendAttempted = false;

  try {
    sql = createSqlClient();
    notificationId = await createSlackNotificationAttempt(sql, {
      text,
      response: {
        source: "manual_api",
        status: "pending",
      },
    });
    sendAttempted = true;
    const result = await sendSlackMessage(text);
    let notificationRecorded = true;

    try {
      await markSlackNotificationDelivered(sql, {
        id: notificationId,
        deliveredAt: result.deliveredAt,
        response: {
          deliveredAt: result.deliveredAt,
          provider: "slack_webhook",
          source: "manual_api",
          status: "delivered",
        },
      });
    } catch {
      notificationRecorded = false;
    }

    return jsonOk({
      delivered: true,
      notificationId,
      notificationRecorded,
      result,
      webhookConfigured: webhookUrl.value.length > 0,
    });
  } catch {
    if (sql && notificationId) {
      await markSlackNotificationFailed(sql, {
        id: notificationId,
        errorCode: "slack_delivery_failed",
        response: {
          source: "manual_api",
        },
      }).catch(() => undefined);
    }

    return sendAttempted
      ? jsonError(502, "slack_delivery_failed", "Slack delivery failed.")
      : jsonError(503, "slack_audit_unavailable", "Slack delivery audit could not be started.");
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}
