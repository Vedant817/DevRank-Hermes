import { IncomingWebhook } from "@slack/webhook";
import {
  DEFAULT_EXTERNAL_HTTP_TIMEOUT_MS,
  readRuntimeEnv,
  requireEnv,
  type RuntimeEnv,
} from "@repo/shared";
import type { TaskActionItem } from "./blocks.js";
import { buildDailyPlanBlocks } from "./blocks.js";
import { sendSlackBlocks } from "./interactive-client.js";

export type { TaskActionItem } from "./blocks.js";
export type { SlackBlockResult } from "./interactive-client.js";
export { buildDailyPlanBlocks } from "./blocks.js";
export { sendSlackBlocks } from "./interactive-client.js";

export interface SlackSendResult {
  text: string;
  deliveredAt: string;
}

export async function sendSlackMessage(
  text: string,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<SlackSendResult> {
  const { SLACK_WEBHOOK_URL } = requireEnv(env, ["SLACK_WEBHOOK_URL"], "Slack");

  const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL, {
    timeout: DEFAULT_EXTERNAL_HTTP_TIMEOUT_MS,
  });
  await webhook.send({ text });

  return {
    text,
    deliveredAt: new Date().toISOString(),
  };
}

export async function sendDailyPlanToSlack(
  tasks: TaskActionItem[],
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<{
  method: "blocks" | "webhook";
  deliveredAt: string;
  ts?: string;
  channel?: string;
}> {
  if (env.SLACK_BOT_TOKEN && env.SLACK_CHANNEL_ID) {
    const blocks = buildDailyPlanBlocks(tasks);
    const result = await sendSlackBlocks(blocks, env);

    return { method: "blocks", deliveredAt: result.deliveredAt, ts: result.ts, channel: result.channel };
  }

  const text = tasks
    .map((task, index) => `${index + 1}. ${task.title} (${task.minutes} min)`)
    .join("\n");
  const result = await sendSlackMessage(text, env);

  return { method: "webhook", deliveredAt: result.deliveredAt };
}
