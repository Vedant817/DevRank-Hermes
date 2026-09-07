import {
  fetchWithPolicy,
  type RuntimeEnv,
} from "@repo/shared";

// Leaf module: provider chain, prompt redaction, and the single shared chat
// caller. Other hermes modules import from here (never from index.js) so the
// package has no import cycles.

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
  [/postgres(?:ql)?:\/\/[^\s"'`)]+/gi, "[REDACTED_DATABASE_URL]"],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/gi, "[REDACTED_GITHUB_TOKEN]"],
  [/github_pat_[A-Za-z0-9_]{20,}/gi, "[REDACTED_GITHUB_TOKEN]"],
  // Longer provider prefixes first: sk-or-v1- would otherwise match the generic sk- rule.
  [/sk-or-v1-[A-Za-z0-9_-]{16,}/gi, "[REDACTED_OPENROUTER_KEY]"],
  [/sk-[A-Za-z0-9_-]{16,}/gi, "[REDACTED_OPENAI_KEY]"],
  [/gsk_[A-Za-z0-9_-]{16,}/gi, "[REDACTED_GROQ_KEY]"],
  [/xox[a-z]-[A-Za-z0-9-]{3,}/g, "[REDACTED_SLACK_TOKEN]"],
  [/lin_api_[A-Za-z0-9_-]{16,}/gi, "[REDACTED_LINEAR_KEY]"],
  [/tvly-[A-Za-z0-9_-]{16,}/gi, "[REDACTED_TAVILY_KEY]"],
  [/sb_[A-Za-z0-9_-]{20,}/gi, "[REDACTED_SUPABASE_KEY]"],
  [/(?:AKIA|ASIA)[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]"],
  // Full PEM block first (header + body + footer), then a header-only fallback.
  // Matching the header alone would leak the base64 key material after it.
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]{0,8000}?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]"],
  [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, "[REDACTED_EMAIL]"],
  // NOTE: JIRA-style issue keys (DEV-123) are intentionally NOT redacted here.
  // Mentor prompts must cite Linear/JIRA IDs as evidence; they are work-item
  // references, not secrets. Raw-transcript privacy still redacts them at
  // ingest time in @repo/ai-chat-ingestors.
  [/\b(customer|client|tenant|account)(?:[_-]?(id|name|email|slug))?\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED_CUSTOMER_REFERENCE]"],
  [/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?(?!\[REDACTED_)[^"'\s)]+/gi, "$1=[REDACTED_SECRET]"],
];

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

interface ProviderChatMessage {
  content: string;
  role: string;
}

export interface HermesChatResult {
  content: string;
  model: string;
  provider: string;
}

export function redactHermesPromptText(value: string) {
  return PROMPT_REDACTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
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

export class HermesRateLimitError extends Error {}

/**
 * Canonical order: trim, then REDACT, then cap. Capping before redacting can
 * split a secret across the cut boundary so the pattern never matches.
 */
export function truncateField(value: string, maxChars: number): string {
  return redactHermesPromptText(value.trim()).slice(0, maxChars).trim();
}

/**
 * Type-guard + redact + per-item cap + element-count cap for string arrays.
 * Element counts are capped because per-char caps alone allow multi-MB
 * prompts via huge arrays.
 */
export function sanitizeStringList(
  values: unknown,
  maxItems: number,
  maxCharsPerItem: number,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => truncateField(entry, maxCharsPerItem))
    .filter((entry) => entry.length > 0)
    .slice(0, maxItems);
}

/**
 * Wrap caller-controlled evidence in explicit delimiters so the model treats
 * it as untrusted data, never as instructions. Prompt-only mitigation, but
 * strictly better than bare interpolation.
 */
export function wrapUntrusted(field: string, value: string): string {
  return `<untrusted-${field}>\n${value}\n</untrusted-${field}>`;
}

export async function callHermesChatProvider(
  provider: HermesProviderConfig,
  messages: ProviderChatMessage[],
  fetchImpl: typeof fetch,
  options: { maxTokens: number; resultLabel: string },
): Promise<HermesChatResult> {
  const response = await fetchWithPolicy(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": provider.httpReferer,
      "X-Title": provider.title,
    },
    body: JSON.stringify({ messages, model: provider.model, max_tokens: options.maxTokens }),
  }, {
    fetch: fetchImpl,
    retry: true,
  });

  if (!response.ok) {
    // Redact the provider body: providers can echo back prompt fragments and
    // the raw text would otherwise leak PII/secrets through the error path.
    const errorText = await response.text().catch(() => "");
    const redacted = redactHermesPromptText(errorText).slice(0, 240);
    const detail = redacted.length > 0 ? `: ${redacted}` : "";
    const message = `AI provider (${provider.name}) request failed with ${response.status}${detail}.`;

    if (response.status === RATE_LIMIT_STATUS) {
      throw new HermesRateLimitError(message);
    }

    throw new Error(message);
  }

  let json: { choices?: Array<{ message?: { content?: unknown } }> };

  try {
    json = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  } catch {
    throw new Error(`AI provider (${provider.name}) returned an invalid response.`);
  }

  const content = json.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error(`AI provider (${provider.name}) response did not include ${options.resultLabel} text.`);
  }

  // Defense in depth: redact model output before it flows into dashboards,
  // Slack, or stored drafts. The model can echo a secret the input regex
  // missed or invent credential-looking text.
  const redacted = redactHermesPromptText(content).trim();

  if (redacted.length === 0) {
    throw new Error(`AI provider (${provider.name}) response did not include ${options.resultLabel} text.`);
  }

  return {
    content: redacted,
    model: provider.model,
    provider: provider.name,
  };
}

function hermesFallbackApiKey(env: RuntimeEnv): string | undefined {
  return env.AI_API_KEY ?? env.OPENROUTER_API_KEY;
}
