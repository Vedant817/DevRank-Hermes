import { DEFAULT_EXTERNAL_HTTP_TIMEOUT_MS, requireEnv, type RuntimeEnv } from "@repo/shared";

export interface SlackBlockResult {
  ts: string;
  channel: string;
  deliveredAt: string;
}

export async function sendSlackBlocks(
  blocks: Record<string, unknown>[],
  env: RuntimeEnv,
): Promise<SlackBlockResult> {
  const { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID } = requireEnv(
    env,
    ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"],
    "Slack interactive messaging",
  );

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: SLACK_CHANNEL_ID,
      blocks,
      text: "DevRank OS daily plan",
    }),
    signal: AbortSignal.timeout(DEFAULT_EXTERNAL_HTTP_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Slack API returned ${response.status}.`);
  }

  const json = await response.json() as { ok: boolean; ts?: string; channel?: string; error?: string };

  if (!json.ok) {
    throw new Error(`Slack API error: ${json.error ?? "unknown"}`);
  }

  return {
    ts: json.ts ?? "",
    channel: json.channel ?? SLACK_CHANNEL_ID,
    deliveredAt: new Date().toISOString(),
  };
}

export async function updateSlackMessage(
  responseUrl: string,
  blocks: Record<string, unknown>[],
): Promise<void> {
  const response = await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks, text: "Task updated" }),
    signal: AbortSignal.timeout(DEFAULT_EXTERNAL_HTTP_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Slack response_url returned ${response.status}.`);
  }
}
