import { Webhooks } from "@octokit/webhooks";
import { readRuntimeEnv, requireEnv, type RuntimeEnv } from "@repo/shared";
import type {
  GithubBackfillResult,
  GithubCommitSummary,
  GithubPullRequestSummary,
  GithubRepoSummary,
  GithubWebhookIngestion,
  GithubWebhookResult,
} from "./types.js";

const SUPPORTED_WEBHOOK_EVENTS = new Set([
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "push",
]);

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

export function isSupportedGithubWebhookEvent(eventName: string, action?: string): boolean {
  if (eventName === "repository") {
    return action === "created";
  }

  return SUPPORTED_WEBHOOK_EVENTS.has(eventName);
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

export function githubWebhookIngestion(
  eventName: string,
  deliveryId: string,
  payload: unknown,
): GithubWebhookIngestion {
  return {
    summary: summarizeGithubWebhook(eventName, deliveryId, payload),
    backfill: githubWebhookBackfill(payload),
  };
}

function githubWebhookBackfill(payload: unknown): GithubBackfillResult {
  const record = asRecord(payload);
  const repo = githubRepoFromPayload(asRecord(record.repository));
  const pullRequest = githubPullRequestFromPayload(asRecord(record.pull_request), repo?.fullName);
  const commits = repo ? githubCommitsFromPayload(record, repo.fullName) : [];

  return {
    commits,
    repoProfiles: [],
    repos: repo ? [repo] : [],
    pullRequests: pullRequest ? [pullRequest] : [],
  };
}

function githubRepoFromPayload(repository: Record<string, unknown>): GithubRepoSummary | undefined {
  const id = numberValue(repository.id);
  const fullName = stringValue(repository.full_name);
  const name = stringValue(repository.name) ?? fullName?.split("/").at(1);
  const owner = ownerLogin(repository.owner) ?? fullName?.split("/").at(0);

  if (id === undefined || fullName === undefined || name === undefined || owner === undefined) {
    return undefined;
  }

  return {
    id,
    owner,
    name,
    fullName,
    private: booleanValue(repository.private) ?? false,
    defaultBranch: stringValue(repository.default_branch) ?? null,
    htmlUrl: stringValue(repository.html_url) ?? null,
    language: stringValue(repository.language) ?? null,
    pushedAt: stringValue(repository.pushed_at) ?? null,
    updatedAt: stringValue(repository.updated_at) ?? null,
  };
}

function githubPullRequestFromPayload(
  pullRequest: Record<string, unknown>,
  repoFullName: string | undefined,
): GithubPullRequestSummary | undefined {
  const id = numberValue(pullRequest.id);
  const number = numberValue(pullRequest.number);
  const title = stringValue(pullRequest.title);
  const state = stringValue(pullRequest.state);

  if (
    id === undefined ||
    number === undefined ||
    title === undefined ||
    state === undefined ||
    repoFullName === undefined
  ) {
    return undefined;
  }

  return {
    id,
    repoFullName,
    number,
    title,
    state,
    htmlUrl: stringValue(pullRequest.html_url) ?? null,
    mergedAt: stringValue(pullRequest.merged_at) ?? null,
    updatedAt: stringValue(pullRequest.updated_at) ?? null,
  };
}

function githubCommitsFromPayload(
  payload: Record<string, unknown>,
  repoFullName: string,
): GithubCommitSummary[] {
  if (!Array.isArray(payload.commits)) {
    return [];
  }

  const branch = branchFromRef(stringValue(payload.ref));
  const commits: GithubCommitSummary[] = [];

  for (const item of payload.commits) {
    const commit = asRecord(item);
    const sha = stringValue(commit.id) ?? stringValue(commit.sha);
    const message = stringValue(commit.message);

    if (sha === undefined || message === undefined) {
      continue;
    }

    commits.push({
      authorLogin: stringValue(asRecord(commit.author).username) ?? null,
      branch,
      committedAt: stringValue(commit.timestamp) ?? null,
      htmlUrl: stringValue(commit.url) ?? null,
      message,
      repoFullName,
      sha,
    });
  }

  return commits;
}

function branchFromRef(ref: string | undefined) {
  return ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;
}

function ownerLogin(value: unknown) {
  return stringValue(asRecord(value).login);
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

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
