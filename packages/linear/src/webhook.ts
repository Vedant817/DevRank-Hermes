import { createHmac, timingSafeEqual } from "node:crypto";
import { readRuntimeEnv, requireEnv, type RuntimeEnv } from "@repo/shared";
import type { LinearWebhookResult } from "./types.js";

export function verifyLinearWebhook(
  payload: string,
  signature: string | null,
  env: RuntimeEnv = readRuntimeEnv(),
): void {
  const { LINEAR_WEBHOOK_SECRET } = requireEnv(
    env,
    ["LINEAR_WEBHOOK_SECRET"],
    "Linear webhook",
  );

  if (!signature) {
    throw new Error("Missing Linear signature header.");
  }

  const expected = createHmac("sha256", LINEAR_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new Error("Invalid Linear webhook signature.");
  }
}

export function summarizeLinearWebhook(payload: unknown): LinearWebhookResult {
  const record = typeof payload === "object" && payload !== null ? payload as {
    action?: string;
    type?: string;
    organizationId?: string;
    url?: string;
  } : {};

  return {
    action: record.action,
    type: record.type,
    organizationId: record.organizationId,
    url: record.url,
  };
}
