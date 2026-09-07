import {
  fetchWithPolicy,
  readRuntimeEnv,
  type RuntimeEnv,
} from "@repo/shared";
import {
  redactHermesPromptText,
  resolveHermesProviderChain,
  type HermesProviderConfig,
} from "./index.js";

export interface HermesDailyMentorInput {
  scoreSummary: string;
  weakestLanes: string[];
  urgentLinearTask?: string;
  benchmarkGap?: string;
  yesterdayOutcome?: string;
}

export interface HermesDailyMentorOutput {
  model: string;
  provider: string;
  plan: string;
}

export interface HermesDailyMentorOptions {
  fetch?: typeof fetch;
}

const RATE_LIMIT_STATUS = 429;
const MAX_SCORE_SUMMARY_CHARS = 8000;
const MAX_LANE_CHARS = 120;
const MAX_OPTIONAL_FIELD_CHARS = 500;

export async function runHermesDailyMentor(
  input: HermesDailyMentorInput,
  env: RuntimeEnv = readRuntimeEnv(),
  options: HermesDailyMentorOptions = {},
): Promise<HermesDailyMentorOutput> {
  const chain = resolveHermesProviderChain(env);

  if (chain.length === 0) {
    throw new Error(
      "Hermes daily mentor is not configured. Missing: GROQ_API_KEY or AI_API_KEY.",
    );
  }

  const scoreSummary = redactHermesPromptText(
    input.scoreSummary.trim().slice(0, MAX_SCORE_SUMMARY_CHARS),
  ).trim();
  const weakestLanes = input.weakestLanes
    .map((lane) => redactHermesPromptText(lane.trim().slice(0, MAX_LANE_CHARS)).trim())
    .filter(Boolean);

  if (scoreSummary.length === 0) {
    throw new Error("Hermes daily mentor requires scoreSummary.");
  }

  if (weakestLanes.length === 0) {
    throw new Error("Hermes daily mentor requires at least one weakest lane.");
  }

  const urgentLinearTask = redactOptionalField(input.urgentLinearTask);
  const benchmarkGap = redactOptionalField(input.benchmarkGap);
  const yesterdayOutcome = redactOptionalField(input.yesterdayOutcome);

  const fetchImpl = options.fetch ?? fetch;
  const sections = [
    `Score summary:\n${scoreSummary}`,
    `Weakest lanes:\n${weakestLanes.join(", ")}`,
  ];

  if (urgentLinearTask) {
    sections.push(`Urgent Linear task:\n${urgentLinearTask}`);
  }

  if (benchmarkGap) {
    sections.push(`Benchmark gap:\n${benchmarkGap}`);
  }

  if (yesterdayOutcome) {
    sections.push(`Yesterday outcome:\n${yesterdayOutcome}`);
  }

  const messages = [
    {
      role: "system",
      content:
        "You are the DevRank OS daily mentor. Ground every recommendation in the provided evidence. Cite PR/SHA/Linear IDs for each claim. Give concrete next actions, no generic advice. Never emit secrets, tokens, or credentials.",
    },
    {
      role: "user",
      content: sections.join("\n\n"),
    },
  ];
  let lastError: unknown;

  for (const [index, provider] of chain.entries()) {
    const isLastAttempt = index === chain.length - 1;

    try {
      return await callHermesDailyMentorProvider(provider, messages, fetchImpl);
    } catch (error) {
      lastError = error;

      if (isLastAttempt || !(error instanceof HermesRateLimitError)) {
        throw error;
      }
      // Rate-limited on this provider; fall through to the next one in the chain.
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Hermes daily mentor failed.");
}

class HermesRateLimitError extends Error {}

async function callHermesDailyMentorProvider(
  provider: HermesProviderConfig,
  messages: Array<{ content: string; role: string }>,
  fetchImpl: typeof fetch,
): Promise<HermesDailyMentorOutput> {
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
  const plan = json.choices?.[0]?.message?.content;

  if (!plan) {
    throw new Error(`AI provider (${provider.name}) response did not include daily mentor plan text.`);
  }

  return {
    model: provider.model,
    provider: provider.name,
    plan,
  };
}

function redactOptionalField(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const redacted = redactHermesPromptText(
    value.trim().slice(0, MAX_OPTIONAL_FIELD_CHARS),
  ).trim();

  return redacted.length > 0 ? redacted : undefined;
}
