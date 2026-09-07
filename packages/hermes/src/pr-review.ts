import { fetchWithPolicy, readRuntimeEnv, type RuntimeEnv } from "@repo/shared";
import {
  redactHermesPromptText,
  resolveHermesProviderChain,
  type HermesProviderConfig,
} from "./index.js";

export interface HermesPrReviewInput {
  diffSummary: string;
  filesChanged: string[];
  checkStatus?: string;
  reviewComments?: string;
}

export interface HermesPrReviewOutput {
  model: string;
  provider: string;
  review: string;
}

export interface HermesPrReviewOptions {
  fetch?: typeof fetch;
}

const MAX_DIFF_SUMMARY_CHARS = 12_000;
const MAX_FILES_CHANGED = 30;
const MAX_FILE_PATH_CHARS = 300;
const MAX_CHECK_STATUS_CHARS = 4_000;
const MAX_REVIEW_COMMENTS_CHARS = 4_000;
const RATE_LIMIT_STATUS = 429;

const PR_REVIEW_SYSTEM_PROMPT = [
  "You are a PR risk and test-gap reviewer.",
  "Use only the provided diff summary, files changed, check status, and prior review comments.",
  "Do not invent code or file contents.",
  "Classify change type, complexity, risk, and test quality.",
  "List missing tests and security smells with concrete file:line references where possible.",
  "Never emit secrets, tokens, passwords, or redacted values.",
].join(" ");

export async function runHermesPrReview(
  input: HermesPrReviewInput,
  env: RuntimeEnv = readRuntimeEnv(),
  options: HermesPrReviewOptions = {},
): Promise<HermesPrReviewOutput> {
  const chain = resolveHermesProviderChain(env);

  if (chain.length === 0) {
    throw new Error(
      "Hermes PR review is not configured. Missing: GROQ_API_KEY or AI_API_KEY.",
    );
  }

  const rawDiffSummary = typeof input.diffSummary === "string" ? input.diffSummary.trim() : "";

  if (rawDiffSummary.length === 0) {
    throw new Error("Hermes PR review requires diffSummary.");
  }

  const diffSummary = redactHermesPromptText(rawDiffSummary)
    .slice(0, MAX_DIFF_SUMMARY_CHARS)
    .trim();

  if (diffSummary.length === 0) {
    throw new Error("Hermes PR review requires diffSummary.");
  }

  const rawFiles = Array.isArray(input.filesChanged) ? input.filesChanged : [];
  const filesChanged = rawFiles
    .filter((file): file is string => typeof file === "string")
    .map((file) => redactHermesPromptText(file.trim()).slice(0, MAX_FILE_PATH_CHARS).trim())
    .filter((file) => file.length > 0)
    .slice(0, MAX_FILES_CHANGED);

  if (filesChanged.length === 0) {
    throw new Error("Hermes PR review requires at least one changed file.");
  }

  const checkStatus = normalizeOptionalField(input.checkStatus, MAX_CHECK_STATUS_CHARS);
  const reviewComments = normalizeOptionalField(input.reviewComments, MAX_REVIEW_COMMENTS_CHARS);

  const fetchImpl = options.fetch ?? fetch;
  const messages = [
    {
      role: "system",
      content: PR_REVIEW_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: buildPrReviewUserPrompt({
        checkStatus,
        diffSummary,
        filesChanged,
        reviewComments,
      }),
    },
  ];
  let lastError: unknown;

  for (const [index, provider] of chain.entries()) {
    const isLastAttempt = index === chain.length - 1;

    try {
      return await callHermesPrReviewProvider(provider, messages, fetchImpl);
    } catch (error) {
      lastError = error;

      if (isLastAttempt || !(error instanceof HermesPrReviewRateLimitError)) {
        throw error;
      }
      // Rate-limited on this provider; fall through to the next one in the chain.
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Hermes PR review failed.");
}

class HermesPrReviewRateLimitError extends Error {}

async function callHermesPrReviewProvider(
  provider: HermesProviderConfig,
  messages: Array<{ content: string; role: string }>,
  fetchImpl: typeof fetch,
): Promise<HermesPrReviewOutput> {
  const response = await fetchWithPolicy(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": provider.httpReferer,
      "X-Title": provider.title,
    },
    body: JSON.stringify({ messages, model: provider.model }),
  }, {
    fetch: fetchImpl,
    retry: true,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const detail = errorText.length > 0 ? `: ${errorText.slice(0, 240)}` : "";
    const message = `AI provider (${provider.name}) request failed with ${response.status}${detail}.`;

    if (response.status === RATE_LIMIT_STATUS) {
      throw new HermesPrReviewRateLimitError(message);
    }

    throw new Error(message);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const review = json.choices?.[0]?.message?.content;

  if (!review) {
    throw new Error(`AI provider (${provider.name}) response did not include PR review text.`);
  }

  return {
    model: provider.model,
    provider: provider.name,
    review,
  };
}

function normalizeOptionalField(value: string | undefined, maxChars: number): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }

  return redactHermesPromptText(trimmed).slice(0, maxChars).trim();
}

function buildPrReviewUserPrompt(input: {
  checkStatus: string;
  diffSummary: string;
  filesChanged: string[];
  reviewComments: string;
}): string {
  const sections = [
    `Diff summary:\n${input.diffSummary}`,
    `Files changed (${input.filesChanged.length}):\n${input.filesChanged.join("\n")}`,
  ];

  if (input.checkStatus.length > 0) {
    sections.push(`Check status:\n${input.checkStatus}`);
  }

  if (input.reviewComments.length > 0) {
    sections.push(`Prior review comments:\n${input.reviewComments}`);
  }

  return sections.join("\n\n");
}
