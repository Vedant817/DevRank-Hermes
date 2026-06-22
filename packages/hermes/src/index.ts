import { readRuntimeEnv, requireEnv, type RuntimeEnv } from "@repo/shared";
export * from "./chat-summary.js";
export * from "./reusable-skills.js";
export * from "./skill-extraction.js";

export interface HermesMentorInput {
  evidenceSummary: string;
  weakestLanes: string[];
}

export interface HermesMentorOutput {
  model: string;
  summary: string;
}

export async function runHermesMentorSummary(
  input: HermesMentorInput,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<HermesMentorOutput> {
  const { OPENROUTER_API_KEY } = requireEnv(
    env,
    ["OPENROUTER_API_KEY"],
    "Hermes/OpenRouter mentor summary",
  );

  const model = "qwen/qwen3-coder:free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://devrank-os.local",
      "X-Title": "DevRank OS",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are the DevRank OS mentor. Use only provided evidence. Do not invent accomplishments.",
        },
        {
          role: "user",
          content: `Evidence:\n${input.evidenceSummary}\n\nWeakest lanes:\n${input.weakestLanes.join(", ")}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with ${response.status}.`);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const summary = json.choices?.[0]?.message?.content;

  if (!summary) {
    throw new Error("OpenRouter response did not include mentor summary text.");
  }

  return {
    model,
    summary,
  };
}
