import { createHmac, timingSafeEqual } from "node:crypto";
import { readRuntimeEnv, requireEnv, type RuntimeEnv } from "@repo/shared";
import type {
  LinearBackfillResult,
  LinearIssueSummary,
  LinearProjectSummary,
  LinearWebhookIngestion,
  LinearWebhookResult,
} from "./types.js";

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

export function linearWebhookIngestion(payload: unknown): LinearWebhookIngestion {
  return {
    summary: summarizeLinearWebhook(payload),
    backfill: linearWebhookBackfill(payload),
  };
}

function linearWebhookBackfill(payload: unknown): LinearBackfillResult {
  const record = asRecord(payload);
  const data = asRecord(record.data);
  const type = stringValue(record.type);
  const project = type === "Project" ? projectFromRecord(data) : projectFromRecord(asRecord(data.project));
  const issue = type === "Issue" ? issueFromRecord(data) : undefined;

  return {
    projects: project ? [project] : [],
    issues: issue ? [issue] : [],
  };
}

function projectFromRecord(record: Record<string, unknown>): LinearProjectSummary | undefined {
  const id = stringValue(record.id);
  const name = stringValue(record.name);

  if (id === undefined || name === undefined) {
    return undefined;
  }

  return {
    id,
    name,
    state: stringValue(record.state) ?? stringValue(asRecord(record.status).name) ?? null,
    progress: numberValue(record.progress) ?? null,
    url: stringValue(record.url) ?? null,
    teamName: stringValue(asRecord(record.team).name) ?? null,
  };
}

function issueFromRecord(record: Record<string, unknown>): LinearIssueSummary | undefined {
  const id = stringValue(record.id);
  const identifier = stringValue(record.identifier);
  const title = stringValue(record.title);
  const url = stringValue(record.url);

  if (id === undefined || identifier === undefined || title === undefined || url === undefined) {
    return undefined;
  }

  return {
    id,
    identifier,
    title,
    priority: numberValue(record.priority) ?? 0,
    url,
    state: stringValue(asRecord(record.state).name) ?? stringValue(record.state) ?? null,
    assignee: stringValue(asRecord(record.assignee).name) ?? null,
    projectId: stringValue(asRecord(record.project).id) ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
