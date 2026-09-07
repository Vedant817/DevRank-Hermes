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

export interface HermesScoreExplainInput {
  laneBreakdown: string;
  evidenceIds: string[];
  weakestLanes: string[];
}

export interface HermesScoreExplainOutput {
  model: string;
  provider: string;
  explanation: string;
}

export interface HermesScoreExplainOptions {
  fetch?: typeof fetch;
}

const MAX_LANE_BREAKDOWN_CHARS = 8000;
const MAX_EVIDENCE_IDS = 25;
const MAX_LANE_CHARS = 120;
const RATE_LIMIT_STATUS = 429;

export async function runHermesScoreExplain(
  input: HermesScoreExplainInput,
  env: RuntimeEnv = readRuntimeEnv(),
  options: HermesScoreExplainOptions = {},
): Promise<HermesScoreExplainOutput> {
  const chain = resolveHermesProviderChain(env);

  if (chain.length === 0) {
    throw new Error(
      "Hermes score explanation is not configured. Missing: GROQ_API_KEY or AI_API_KEY.",
    );
  }

  const laneBreakdown = redactHermesPromptText(input.laneBreakdown.trim()).slice(
    0,
    MAX_LANE_BREAKDOWN_CHARS,
  ).trim();

  const evidenceIds = input.evidenceIds
    .map((id) => redactHermesPromptText(id.trim()))
    .filter(Boolean)
    .slice(0, MAX_EVIDENCE_IDS);

  const weakestLanes = input.weakestLanes
    .map((lane) => redactHermesPromptText(lane.trim()).slice(0, MAX_LANE_CHARS).trim())
    .filter(Boolean);

  if (laneBreakdown.length === 0) {
    throw new Error("Hermes score explanation requires laneBreakdown.");
  }

  if (evidenceIds.length === 0) {
    throw new Error("Hermes score explanation requires at least one evidenceId.");
  }

  if (weakestLanes.length === 0) {
    throw new Error("Hermes score explanation requires at least one weakest lane.");
  }

  const fetchImpl = options.fetch ?? fetch;
  const messages = [
    {
      role: "system",
      content:
        "You are a transparent scoring narrator for DevRank OS. Explain per-lane why the score is what it is using only the provided lane breakdown and evidence IDs. For each weakest lane, name which 2 evidence items would move it most. Never invent scores, evidence, or accomplishments. Never emit secrets, tokens, or private data.",
    },
    {
      role: "user",
      content: `Lane breakdown:\n${laneBreakdown}\n\nEvidence IDs:\n${evidenceIds.join(", ")}\n\nWeakest lanes:\n${weakestLanes.join(", ")}`,
    },
  ];
  let lastError: unknown;

  for (const [index, provider] of chain.entries()) {
    const isLastAttempt = index === chain.length - 1;

    try {
      return await callHermesScoreExplainProvider(provider, messages, fetchImpl);
    } catch (error) {
      lastError = error;

      if (isLastAttempt || !(error instanceof HermesScoreExplainRateLimitError)) {
        throw error;
      }
      // Rate-limited on this provider; fall through to the next one in the chain.
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Hermes score explanation failed.");
}

class HermesScoreExplainRateLimitError extends Error {}

async function callHermesScoreExplainProvider(
  provider: HermesProviderConfig,
  messages: Array<{ content: string; role: string }>,
  fetchImpl: typeof fetch,
): Promise<HermesScoreExplainOutput> {
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
      throw new HermesScoreExplainRateLimitError(message);
    }

    throw new Error(message);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const explanation = json.choices?.[0]?.message?.content;

  if (!explanation) {
    throw new Error(`AI provider (${provider.name}) response did not include score explanation text.`);
  }

  return {
    model: provider.model,
    provider: provider.name,
    explanation,
  };
}
