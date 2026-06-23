import { MastraClient } from "@repo/mastra";
import { readRuntimeEnv, type RuntimeEnv } from "@repo/shared";
export * from "./chat-summary.js";
export * from "./reusable-skills.js";
export * from "./skill-extraction.js";

const PROMPT_REDACTIONS: Array<[RegExp, string]> = [
  [/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DATABASE_URL]"],
  [/(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]"],
  [/xox[baprs]-[A-Za-z0-9-]+/g, "[REDACTED_SLACK_TOKEN]"],
  [/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?(?!\[REDACTED_)[^"'\s)]+/gi, "$1=[REDACTED_SECRET]"],
];

export interface HermesMentorInput {
  evidenceSummary: string;
  weakestLanes: string[];
}

export interface HermesMentorOutput {
  model: string;
  summary: string;
}

export interface HermesRuntimeConfig {
  baseUrl: string;
  httpReferer: string;
  model: string;
  title: string;
}

export interface HermesMentorOptions {
  fetch?: typeof fetch;
}

export function resolveHermesRuntimeConfig(env: RuntimeEnv): HermesRuntimeConfig {
  return {
    baseUrl: env.AI_BASE_URL ?? env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    httpReferer: env.AI_HTTP_REFERER ?? env.HERMES_HTTP_REFERER ?? "https://devrank-os.local",
    model: env.AI_MODEL ?? env.HERMES_MODEL ?? "openrouter/auto",
    title: env.AI_TITLE ?? env.HERMES_TITLE ?? "DevRank OS",
  };
}

export async function runHermesMentorSummary(
  input: HermesMentorInput,
  env: RuntimeEnv = readRuntimeEnv(),
  options: HermesMentorOptions = {},
): Promise<HermesMentorOutput> {
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

  const client = new MastraClient(env, options.fetch);
  const summary = await client.chatCompletion(
    [
      {
        role: "user",
        content: `Evidence:\n${evidenceSummary}\n\nWeakest lanes:\n${weakestLanes.join(", ")}`,
      },
    ],
    {
      system: "You are the DevRank OS mentor. Use only provided evidence. Do not invent accomplishments.",
    },
  );

  return {
    model: client.getModel(),
    summary,
  };
}

export function redactHermesPromptText(value: string) {
  return PROMPT_REDACTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}
