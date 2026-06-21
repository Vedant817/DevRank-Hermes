import { Webhooks } from "@octokit/webhooks";
import { readRuntimeEnv, requireEnv, type RuntimeEnv } from "@repo/shared";
import type { GithubWebhookResult } from "./types.js";

export async function verifyGithubWebhook(
  payload: string,
  signature: string | null,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<void> {
  const { GITHUB_WEBHOOK_SECRET } = requireEnv(
    env,
    ["GITHUB_WEBHOOK_SECRET"],
    "GitHub webhook",
  );

  if (!signature) {
    throw new Error("Missing GitHub signature header.");
  }

  const webhooks = new Webhooks({
    secret: GITHUB_WEBHOOK_SECRET,
  });

  const verified = await webhooks.verify(payload, signature);

  if (!verified) {
    throw new Error("Invalid GitHub webhook signature.");
  }
}

export function summarizeGithubWebhook(
  eventName: string,
  deliveryId: string,
  payload: unknown,
): GithubWebhookResult {
  const record = typeof payload === "object" && payload !== null ? payload as {
    action?: string;
    repository?: { full_name?: string };
    pull_request?: { number?: number };
  } : {};

  return {
    eventName,
    deliveryId,
    action: record.action,
    repository: record.repository?.full_name,
    pullRequestNumber: record.pull_request?.number,
  };
}
