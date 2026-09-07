import {
  fetchWithPolicy,
  readRuntimeEnv,
  type RuntimeEnv,
} from "@repo/shared";
export * from "./chat-summary.js";
export * from "./daily-mentor.js";
export * from "./pr-review.js";
export * from "./reusable-skills.js";
export * from "./score-explain.js";
export * from "./skill-extraction.js";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_HERMES_MODEL = "openrouter/auto";
const DEFAULT_HTTP_REFERER = "https://devrank-os.local";
const DEFAULT_TITLE = "DevRank OS";
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
// Groq's largest hosted general-reasoning model. Override with GROQ_MODEL if
// Groq later ships a stronger flagship model.
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const RATE_LIMIT_STATUS = 429;
const PROMPT_REDACTIONS: Array<[RegExp, string]> = [
  [/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]"],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]"],
  [/sk-or-v1-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENROUTER_KEY]"],
  [/xox[baprs]-[A-Za-z0-9-]+/g, "[REDACTED_SLACK_TOKEN]"],
  [/lin_api_[A-Za-z0-9_-]{16,}/g, "[REDACTED_LINEAR_KEY]"],
  [/tvly-[A-Za-z0-9_-]{16,}/g, "[REDACTED_TAVILY_KEY]"],
  [/sb_[A-Za-z0-9_-]{16,}/g, "[REDACTED_SUPABASE_KEY]"],
  [/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]"],
  [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, "[REDACTED_EMAIL]"],
  [/\b[A-Z][A-Z0-9]{1,9}-\d{1,8}\b/g, "[REDACTED_JIRA_REFERENCE]"],
  [/\b(customer|client|tenant|account)(?:[_-]?(id|name|email|slug))?\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED_CUSTOMER_REFERENCE]"],
  [/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?(?!\[REDACTED_)[^"'\s)]+/gi, "$1=[REDACTED_SECRET]"],
];

export interface HermesMentorInput {
  evidenceSummary: string;
  weakestLanes: string[];
}

export interface HermesMentorOutput {
  model: string;
  provider: string;
  summary: string;
}

export interface HermesRuntimeConfig {
  baseUrl: string;
  httpReferer: string;
  model: string;
  title: string;
}

export interface HermesProviderConfig extends HermesRuntimeConfig {
  apiKey: string;
  name: string;
}

export interface HermesMentorOptions {
  fetch?: typeof fetch;
}

export function resolveHermesRuntimeConfig(env: RuntimeEnv): HermesRuntimeConfig {
  return {
    baseUrl: env.AI_BASE_URL ?? env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL,
    httpReferer: env.AI_HTTP_REFERER ?? env.HERMES_HTTP_REFERER ?? DEFAULT_HTTP_REFERER,
    model: env.AI_MODEL ?? env.HERMES_MODEL ?? DEFAULT_HERMES_MODEL,
    title: env.AI_TITLE ?? env.HERMES_TITLE ?? DEFAULT_TITLE,
  };
}

// Groq is the default reasoning provider (fast inference, generous free
// tier). When GROQ_API_KEY is set it is attempted first; on a 429 rate-limit
// response the caller falls back to the OpenRouter-compatible provider
// resolved by resolveHermesRuntimeConfig/hermesFallbackApiKey. Set only
// OPENROUTER_API_KEY (or AI_API_KEY) to skip Groq entirely.
export function resolveHermesProviderChain(env: RuntimeEnv): HermesProviderConfig[] {
  const shared = resolveHermesRuntimeConfig(env);
  const chain: HermesProviderConfig[] = [];

  if (env.GROQ_API_KEY) {
    chain.push({
      apiKey: env.GROQ_API_KEY,
      baseUrl: env.GROQ_BASE_URL ?? DEFAULT_GROQ_BASE_URL,
      httpReferer: shared.httpReferer,
      model: env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
      name: "groq",
      title: shared.title,
    });
  }

  const fallbackApiKey = hermesFallbackApiKey(env);

  if (fallbackApiKey) {
    chain.push({
      ...shared,
      apiKey: fallbackApiKey,
      name: "openrouter",
    });
  }

  return chain;
}

export async function runHermesMentorSummary(
  input: HermesMentorInput,
  env: RuntimeEnv = readRuntimeEnv(),
  options: HermesMentorOptions = {},
): Promise<HermesMentorOutput> {
  const chain = resolveHermesProviderChain(env);

  if (chain.length === 0) {
    throw new Error(
      "Hermes mentor summary is not configured. Missing: GROQ_API_KEY or AI_API_KEY.",
    );
  }

  const evidenceSummary = redactHermesPromptText(input.evidenceSummary.trim());
  const weakestLanes = input.weakestLanes
    .map((lane) => redactHermesPromptText(lane.trim()))
    .filter(Boolean);

  if (evidenceSummary.length === 0) {
    throw new Error("Hermes mentor summary requires evidenceSummary.");
  }

  if (weakestLanes.length === 0) {
    throw new Error("Hermes mentor summary requires at least one weakest lane.");
  }

  const fetchImpl = options.fetch ?? fetch;
  const messages = [
    {
      role: "system",
      content:
        "You are the DevRank OS mentor. Use only provided evidence. Do not invent accomplishments.",
    },
    {
      role: "user",
      content: `Evidence:\n${evidenceSummary}\n\nWeakest lanes:\n${weakestLanes.join(", ")}`,
    },
  ];
  let lastError: unknown;

  for (const [index, provider] of chain.entries()) {
    const isLastAttempt = index === chain.length - 1;

    try {
      return await callHermesProvider(provider, messages, fetchImpl);
    } catch (error) {
      lastError = error;

      if (isLastAttempt || !(error instanceof HermesRateLimitError)) {
        throw error;
      }
      // Rate-limited on this provider; fall through to the next one in the chain.
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Hermes mentor summary failed.");
}

class HermesRateLimitError extends Error {}

async function callHermesProvider(
  provider: HermesProviderConfig,
  messages: Array<{ content: string; role: string }>,
  fetchImpl: typeof fetch,
): Promise<HermesMentorOutput> {
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
      throw new HermesRateLimitError(message);
    }

    throw new Error(message);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const summary = json.choices?.[0]?.message?.content;

  if (!summary) {
    throw new Error(`AI provider (${provider.name}) response did not include mentor summary text.`);
  }

  return {
    model: provider.model,
    provider: provider.name,
    summary,
  };
}

export function redactHermesPromptText(value: string) {
  return PROMPT_REDACTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function hermesFallbackApiKey(env: RuntimeEnv): string | undefined {
  return env.AI_API_KEY ?? env.OPENROUTER_API_KEY;
}
