import { IncomingWebhook } from "@slack/webhook";
import {
  DEFAULT_EXTERNAL_HTTP_TIMEOUT_MS,
  readRuntimeEnv,
  requireEnv,
  type RuntimeEnv,
} from "@repo/shared";

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
