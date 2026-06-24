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
  const record = asRecord(payload);
  const action = stringValue(record.action);
  const type = stringValue(record.type);
  const entityId = stringValue(asRecord(record.data).id);

  return {
    summary: summarizeLinearWebhook(payload),
    backfill: action === "remove"
      ? { projects: [], issues: [] }
      : linearWebhookBackfill(payload),
    deletions: {
      issueIds: action === "remove" && type === "Issue" && entityId ? [entityId] : [],
      projectIds: action === "remove" && type === "Project" && entityId ? [entityId] : [],
    },
  };
}

function linearWebhookBackfill(payload: unknown): LinearBackfillResult {
  const record = asRecord(payload);
  const data = asRecord(record.data);
  const type = stringValue(record.type);
  const workspace = workspaceFromRecord(asRecord(record.organization), stringValue(record.organizationId));
  const project = type === "Project" ? projectFromRecord(data, workspace) : projectFromRecord(asRecord(data.project), workspace);
  const issue = type === "Issue" ? issueFromRecord(data, workspace) : undefined;

  return {
    projects: project ? [project] : [],
    issues: issue ? [issue] : [],
  };
}

type WorkspaceRecord = {
  id?: string | null;
  name?: string | null;
  urlKey?: string | null;
};

function projectFromRecord(
  record: Record<string, unknown>,
  inheritedWorkspace?: WorkspaceRecord,
): LinearProjectSummary | undefined {
  const id = stringValue(record.id);
  const name = stringValue(record.name);

  if (id === undefined || name === undefined) {
    return undefined;
  }

  const team = asRecord(record.team);
  const workspace = workspaceFromRecord(asRecord(record.organization))
    ?? workspaceFromRecord(asRecord(team.organization))
    ?? inheritedWorkspace;

  return {
    id,
    name,
    state: stringValue(record.state) ?? stringValue(asRecord(record.status).name) ?? null,
    progress: numberValue(record.progress) ?? null,
    url: stringValue(record.url) ?? null,
    teamKey: stringValue(team.key) ?? null,
    teamId: stringValue(team.id) ?? null,
    teamName: stringValue(team.name) ?? null,
    workspaceId: workspace?.id ?? null,
    workspaceName: workspace?.name ?? null,
    workspaceUrlKey: workspace?.urlKey ?? null,
  };
}

function issueFromRecord(
  record: Record<string, unknown>,
  inheritedWorkspace?: WorkspaceRecord,
): LinearIssueSummary | undefined {
  const id = stringValue(record.id);
  const identifier = stringValue(record.identifier);
  const title = stringValue(record.title);
  const url = stringValue(record.url);

  if (id === undefined || identifier === undefined || title === undefined || url === undefined) {
    return undefined;
  }

  const project = asRecord(record.project);
  const team = asRecord(record.team);
  const projectTeam = asRecord(project.team);
  const workspace = workspaceFromRecord(asRecord(record.organization))
    ?? workspaceFromRecord(asRecord(team.organization))
    ?? workspaceFromRecord(asRecord(project.organization))
    ?? workspaceFromRecord(asRecord(projectTeam.organization))
    ?? inheritedWorkspace;

  return {
    id,
    identifier,
    title,
    priority: numberValue(record.priority) ?? 0,
    url,
    state: stringValue(asRecord(record.state).name) ?? stringValue(record.state) ?? null,
    assignee: stringValue(asRecord(record.assignee).name) ?? null,
    projectId: stringValue(project.id) ?? null,
    teamKey: stringValue(team.key) ?? stringValue(projectTeam.key) ?? null,
    teamId: stringValue(team.id) ?? stringValue(projectTeam.id) ?? null,
    teamName: stringValue(team.name) ?? stringValue(projectTeam.name) ?? null,
    updatedAt: stringValue(record.updatedAt) ?? null,
    workspaceId: workspace?.id ?? null,
    workspaceName: workspace?.name ?? null,
    workspaceUrlKey: workspace?.urlKey ?? null,
  };
}

function workspaceFromRecord(
  record: Record<string, unknown>,
  fallbackId?: string,
): WorkspaceRecord | undefined {
  const id = stringValue(record.id) ?? fallbackId;
  const name = stringValue(record.name);
  const urlKey = stringValue(record.urlKey);

  if (id === undefined && name === undefined && urlKey === undefined) {
    return undefined;
  }

  return {
    id: id ?? null,
    name: name ?? null,
    urlKey: urlKey ?? null,
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
