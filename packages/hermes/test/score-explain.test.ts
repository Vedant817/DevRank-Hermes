import assert from "node:assert/strict";
import test from "node:test";
import { runHermesScoreExplain } from "../src/index.js";

const baseInput = {
  laneBreakdown: "Backend: 70 (tested webhook path). Frontend: 40 (no recent work).",
  evidenceIds: ["ev-1", "ev-2"],
  weakestLanes: ["Frontend"],
};

test("sends score explanation request with configured model and endpoint", async () => {
  const requests: Array<{ body: unknown; headers: Headers; url: string }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Backend is strong because of ev-1; Frontend lags." } }],
    }));
  };

  const result = await runHermesScoreExplain(
    baseInput,
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
  assert.equal(result.explanation, "Backend is strong because of ev-1; Frontend lags.");
  assert.equal(requests[0]?.url, "https://provider.example/api/v1/chat/completions");
  assert.equal(requests[0]?.headers.get("Authorization"), "Bearer test-key");
  assert.equal(requests[0]?.headers.get("HTTP-Referer"), "https://devrank.example");
  assert.equal(requests[0]?.headers.get("X-Title"), "DevRank Production");
  assert.equal((requests[0]?.body as { model?: string }).model, "google/gemini-flash-1.5");
  const messages = (requests[0]?.body as { messages?: Array<{ content?: string; role?: string }> }).messages ?? [];
  assert.equal(messages[0]?.role, "system");
  assert.match(messages[0]?.content ?? "", /transparent scoring narrator/);
  assert.match(messages[0]?.content ?? "", /Never invent scores/);
  assert.match(messages[0]?.content ?? "", /Never emit secrets/);
});

test("rejects when no provider API key is configured", async () => {
  await assert.rejects(
    runHermesScoreExplain(
      baseInput,
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

test("rejects empty lane breakdown before calling AI provider", async () => {
  await assert.rejects(
    runHermesScoreExplain(
      { ...baseInput, laneBreakdown: " " },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /requires laneBreakdown/,
  );
});

test("rejects when no evidence IDs are provided", async () => {
  await assert.rejects(
    runHermesScoreExplain(
      { ...baseInput, evidenceIds: [] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /requires at least one evidenceId/,
  );
});

test("rejects when no weakest lanes are provided", async () => {
  await assert.rejects(
    runHermesScoreExplain(
      { ...baseInput, weakestLanes: [] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /requires at least one weakest lane/,
  );
});

test("rejects non-array evidence IDs without calling AI provider", async () => {
  await assert.rejects(
    runHermesScoreExplain(
      { ...baseInput, evidenceIds: "ev-1" as unknown as string[] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /requires at least one evidenceId/,
  );
});

test("redacts secret-like content before calling AI provider", async () => {
  const requests: Array<{ body: { messages?: Array<{ content?: string }> } }> = [];
  const fetchMock: typeof fetch = async (_url, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Explanation uses redacted evidence only." } }],
    }));
  };

  await runHermesScoreExplain(
    {
      laneBreakdown: "Backend: 70. Fixed token=secret-value and postgres://user:pass@example/db with sk-testsecretvalue123456.",
      evidenceIds: ["ev-1"],
      weakestLanes: ["api_key=secret-value"],
    },
    { AI_API_KEY: "test-key" },
    { fetch: fetchMock },
  );

  const prompt = requests[0]?.body.messages?.[1]?.content ?? "";

  assert.doesNotMatch(prompt, /secret-value/);
  assert.doesNotMatch(prompt, /postgres:\/\/user:pass@example\/db/);
  assert.doesNotMatch(prompt, /sk-testsecretvalue123456/);
  assert.match(prompt, /\[REDACTED_SECRET\]/);
  assert.match(prompt, /\[REDACTED_DATABASE_URL\]/);
  assert.match(prompt, /\[REDACTED_OPENAI_KEY\]/);
});

test("calls Groq first and returns its result without touching the fallback", async () => {
  const calledUrls: string[] = [];
  const fetchMock: typeof fetch = async (url) => {
    calledUrls.push(String(url));

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Groq score explanation." } }],
    }));
  };

  const result = await runHermesScoreExplain(
    baseInput,
    { GROQ_API_KEY: "groq-key", OPENROUTER_API_KEY: "or-key" },
    { fetch: fetchMock },
  );

  assert.equal(result.provider, "groq");
  assert.equal(result.explanation, "Groq score explanation.");
  assert.deepEqual(calledUrls, ["https://api.groq.com/openai/v1/chat/completions"]);
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
      choices: [{ message: { content: "OpenRouter fallback explanation." } }],
    }));
  };

  const result = await runHermesScoreExplain(
    baseInput,
    { GROQ_API_KEY: "groq-key", OPENROUTER_API_KEY: "or-key" },
    { fetch: fetchMock },
  );

  assert.equal(result.provider, "openrouter");
  assert.equal(result.explanation, "OpenRouter fallback explanation.");
  // Billed AI POSTs are not replayed; provider failover remains available.
  assert.deepEqual(calledUrls, [
    "https://api.groq.com/openai/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions",
  ]);
});
