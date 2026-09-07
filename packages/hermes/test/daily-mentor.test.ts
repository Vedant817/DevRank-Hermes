import assert from "node:assert/strict";
import test from "node:test";
import { runHermesDailyMentor } from "../src/index.js";

test("rejects when no provider API key is configured", async () => {
  await assert.rejects(
    runHermesDailyMentor(
      { scoreSummary: "Score held steady.", weakestLanes: ["DSA"] },
      {},
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /not configured/,
  );
});

test("rejects empty scoreSummary before calling AI provider", async () => {
  await assert.rejects(
    runHermesDailyMentor(
      { scoreSummary: " ", weakestLanes: ["DSA"] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /requires scoreSummary/,
  );
});

test("rejects when no weakest lane is provided", async () => {
  await assert.rejects(
    runHermesDailyMentor(
      { scoreSummary: "Score held steady.", weakestLanes: ["  "] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /weakest lane/,
  );
});

test("sends daily mentor request with configured model and endpoint", async () => {
  const requests: Array<{ body: unknown; headers: Headers; url: string }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Ship the Linear task first." } }],
    }));
  };

  const result = await runHermesDailyMentor(
    {
      scoreSummary: "Backend lane slipped 4 points.",
      weakestLanes: ["Backend/API/System Design"],
      urgentLinearTask: "Ship webhook retry for onboarding flow",
      benchmarkGap: "P50 latency above target",
      yesterdayOutcome: "Landed checkout fix",
    },
    {
      AI_API_KEY: "test-key",
      AI_BASE_URL: "https://provider.example/api/v1/",
      AI_MODEL: "google/gemini-flash-1.5",
      AI_HTTP_REFERER: "https://devrank.example",
      AI_TITLE: "DevRank Production",
    },
    { fetch: fetchMock },
  );

  assert.equal(result.model, "google/gemini-flash-1.5");
  assert.equal(result.provider, "openrouter");
  assert.equal(result.plan, "Ship the Linear task first.");
  assert.equal(requests[0]?.url, "https://provider.example/api/v1/chat/completions");
  assert.equal(requests[0]?.headers.get("Authorization"), "Bearer test-key");
  assert.equal((requests[0]?.body as { model?: string }).model, "google/gemini-flash-1.5");

  const body = requests[0]?.body as {
    messages?: Array<{ content?: string; role?: string }>;
  };
  const systemPrompt = body.messages?.[0]?.content ?? "";
  const userPrompt = body.messages?.[1]?.content ?? "";

  assert.match(systemPrompt, /PR\/SHA\/Linear IDs/);
  assert.match(userPrompt, /Backend lane slipped/);
  assert.match(userPrompt, /webhook retry for onboarding/);
});

test("redacts secret-like inputs before calling AI provider", async () => {
  const requests: Array<{ body: { messages?: Array<{ content?: string }> } }> = [];
  const fetchMock: typeof fetch = async (_url, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Use redacted evidence only." } }],
    }));
  };

  await runHermesDailyMentor(
    {
      scoreSummary: "Fixed token=secret-value and postgres://user:pass@example/db with sk-testsecretvalue123456.",
      weakestLanes: ["api_key=secret-value"],
      urgentLinearTask: "token=secret-value",
      benchmarkGap: "password=hunter2value",
      yesterdayOutcome: "postgres://user:pass@example/db",
    },
    { AI_API_KEY: "test-key" },
    { fetch: fetchMock },
  );

  const prompt = requests[0]?.body.messages?.map((message) => message.content).join("\n") ?? "";

  assert.doesNotMatch(prompt, /secret-value/);
  assert.doesNotMatch(prompt, /postgres:\/\/user:pass@example\/db/);
  assert.doesNotMatch(prompt, /sk-testsecretvalue123456/);
  assert.doesNotMatch(prompt, /hunter2value/);
  assert.match(prompt, /\[REDACTED_SECRET\]/);
  assert.match(prompt, /\[REDACTED_DATABASE_URL\]/);
  assert.match(prompt, /\[REDACTED_OPENAI_KEY\]/);
});

test("falls back to OpenRouter when Groq keeps returning a 429 rate-limit response", async () => {
  const calledUrls: string[] = [];
  const fetchMock: typeof fetch = async (url) => {
    const requestUrl = String(url);
    calledUrls.push(requestUrl);

    if (requestUrl.includes("groq.com")) {
      return new Response("rate limited", { status: 429 });
    }

    return new Response(JSON.stringify({
      choices: [{ message: { content: "OpenRouter fallback plan." } }],
    }));
  };

  const result = await runHermesDailyMentor(
    { scoreSummary: "Score held steady.", weakestLanes: ["Backend/API"] },
    { GROQ_API_KEY: "groq-key", OPENROUTER_API_KEY: "or-key" },
    { fetch: fetchMock },
  );

  assert.equal(result.provider, "openrouter");
  assert.equal(result.plan, "OpenRouter fallback plan.");
  // fetchWithPolicy retries a 429 against the same provider once before the
  // provider chain moves on, so Groq is hit twice before OpenRouter is tried.
  assert.deepEqual(calledUrls, [
    "https://api.groq.com/openai/v1/chat/completions",
    "https://api.groq.com/openai/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions",
  ]);
});
