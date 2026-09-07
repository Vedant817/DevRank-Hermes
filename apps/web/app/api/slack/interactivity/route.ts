import { createHmac, timingSafeEqual } from "node:crypto";
import {
  closeSqlClient,
  createSqlClient,
  updateDailyTaskStatus,
} from "@repo/db";
import { getRequiredEnv, jsonError, jsonOk, methodNotAllowed, rateLimit, readRawBody } from "../../_lib/route-utils";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLACK_SIGNING_VERSION = "v0";
const REPLAY_WINDOW_MS = 5 * 60 * 1_000;

interface SlackPayload {
  type: string;
  user?: { id: string; name?: string };
  actions?: Array<{
    action_id: string;
    value: string;
    block_id?: string;
  }>;
  response_url?: string;
  message?: { ts?: string };
  container?: { message_ts?: string };
}

export async function POST(request: NextRequest) {
  const limitError = await rateLimit(request, {
    key: "slack_interactivity",
    limit: 30,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const bodyResult = await readRawBody(request, { maxBytes: 64 * 1024 });

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const signatureEnv = getRequiredEnv("SLACK_SIGNING_SECRET");

  if (!signatureEnv.ok) {
    return signatureEnv.response;
  }

  const signatureValid = verifySlackSignature(
    bodyResult.text,
    request.headers.get("x-slack-signature") ?? "",
    request.headers.get("x-slack-request-timestamp") ?? "",
    signatureEnv.value,
  );

  if (!signatureValid) {
    return jsonError(401, "signature_invalid", "Slack request signature verification failed.");
  }

  const parsed = parseSlackPayload(bodyResult.text);

  if (!parsed) {
    return jsonError(400, "invalid_payload", "Slack payload could not be parsed.");
  }

  if (parsed.type !== "block_actions" || !parsed.actions || parsed.actions.length === 0) {
    return jsonOk({ ignored: true, reason: "unhandled_slack_event_type" });
  }

  const action = parsed.actions[0]!;
  const { action_id, value } = action;

  if (!value) {
    return jsonError(400, "missing_value", "Button action is missing a value.");
  }

  let date: string;
  let taskKey: string;

  try {
    const parsedValue = JSON.parse(value) as { date?: string; taskKey?: string };

    if (typeof parsedValue.date !== "string" || typeof parsedValue.taskKey !== "string") {
      return jsonError(400, "invalid_value", "Button value must include date and taskKey.");
    }

    date = parsedValue.date;
    taskKey = parsedValue.taskKey;
  } catch {
    return jsonError(400, "invalid_value", "Button value must be valid JSON.");
  }

  const newStatus = action_id === "task_complete" ? "completed" as const
    : action_id === "task_skip" ? "skipped" as const
    : undefined;

  if (!newStatus) {
    return jsonError(400, "unknown_action", `Unknown action_id: ${action_id}`);
  }

  try {
    const sql = createSqlClient();

    try {
      const task = await updateDailyTaskStatus(sql, {
        date,
        taskKey,
        status: newStatus,
      });

      if (!task) {
        return jsonError(404, "task_not_found", "No daily task exists for the provided date and taskKey.");
      }

      const responseUrl = parsed.response_url;

      if (responseUrl) {
        const label = newStatus === "completed" ? "Done :white_check_mark:" : "Skipped :fast_forward:";
        const replacementBlocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `~${task.title}~ — *${label}*`,
            },
          },
        ];

        fetch(responseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks: replacementBlocks, text: `${task.title} — ${label}` }),
          signal: AbortSignal.timeout(8_000),
        }).catch(() => undefined);
      }

      return jsonOk({ task: { date, taskKey, status: newStatus } });
    } finally {
      await closeSqlClient(sql);
    }
  } catch {
    return jsonError(503, "task_update_failed", "Task status update failed.");
  }
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export function PUT() {
  return methodNotAllowed(["POST"]);
}

export function DELETE() {
  return methodNotAllowed(["POST"]);
}

function verifySlackSignature(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string,
  signingSecret: string,
): boolean {
  const timestamp = Number(timestampHeader);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const nowMs = Date.now();
  const thenMs = timestamp * 1_000;

  // Reject stale replays and future-dated requests (clock-skew tolerance 60s).
  if (nowMs - thenMs > REPLAY_WINDOW_MS || thenMs - nowMs > 60_000) {
    return false;
  }

  if (!signatureHeader.startsWith(`${SLACK_SIGNING_VERSION}=`)) {
    return false;
  }

  const baseString = `${SLACK_SIGNING_VERSION}:${timestampHeader}:${rawBody}`;
  const expected = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const received = signatureHeader.slice(SLACK_SIGNING_VERSION.length + 1);

  if (expected.length !== received.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
  } catch {
    return false;
  }
}

function parseSlackPayload(rawBody: string): SlackPayload | undefined {
  // application/x-www-form-urlencoded: payload=<json> possibly alongside other
  // fields, with "+" encoding spaces. Find the payload field explicitly.
  const payloadField = rawBody
    .split("&")
    .map((part) => part.trim())
    .find((part) => part === "payload" || part.startsWith("payload="));

  if (!payloadField || !payloadField.startsWith("payload=")) {
    return undefined;
  }

  try {
    const encoded = payloadField.slice("payload=".length).replaceAll("+", " ");
    const decoded = JSON.parse(decodeURIComponent(encoded)) as SlackPayload;

    return decoded;
  } catch {
    return undefined;
  }
}
