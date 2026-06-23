import { MastraClient } from "@repo/mastra";
import { readRuntimeEnv, type RuntimeEnv } from "@repo/shared";
export * from "./chat-summary.js";
export * from "./reusable-skills.js";
export * from "./skill-extraction.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/auto";
const DEFAULT_HTTP_REFERER = "https://devrank-os.local";
const DEFAULT_TITLE = "DevRank OS";

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
    baseUrl: env.AI_BASE_URL ?? env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL,
    httpReferer: env.AI_HTTP_REFERER ?? env.HERMES_HTTP_REFERER ?? DEFAULT_HTTP_REFERER,
    model: env.AI_MODEL ?? env.HERMES_MODEL ?? DEFAULT_MODEL,
    title: env.AI_TITLE ?? env.HERMES_TITLE ?? DEFAULT_TITLE,
  };
}

export async function runHermesMentorSummary(
  input: HermesMentorInput,
  env: RuntimeEnv = readRuntimeEnv(),
  options: HermesMentorOptions = {},
): Promise<HermesMentorOutput> {
  const evidenceSummary = input.evidenceSummary.trim();
  const weakestLanes = input.weakestLanes.map((lane) => lane.trim()).filter(Boolean);

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


