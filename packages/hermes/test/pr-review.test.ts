import assert from "node:assert/strict";
import test from "node:test";
import { runHermesPrReview } from "../src/index.js";

test("rejects when no provider API key is configured", async () => {
  await assert.rejects(
    runHermesPrReview(
      { diffSummary: "Changed auth flow.", filesChanged: ["src/auth.ts"] },
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

test("rejects empty diffSummary before calling AI provider", async () => {
  await assert.rejects(
    runHermesPrReview(
      { diffSummary: " ", filesChanged: ["src/auth.ts"] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /requires diffSummary/,
  );
});

test("rejects when no changed file is provided", async () => {
  await assert.rejects(
    runHermesPrReview(
      { diffSummary: "Changed auth flow.", filesChanged: [] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /changed file/,
  );
});

test("rejects non-string diffSummary without calling AI provider", async () => {
  await assert.rejects(
    runHermesPrReview(
      { diffSummary: undefined as unknown as string, filesChanged: ["src/auth.ts"] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /requires diffSummary/,
  );
});

test("rejects non-array filesChanged without calling AI provider", async () => {
  await assert.rejects(
    runHermesPrReview(
      { diffSummary: "Changed auth flow.", filesChanged: "src/auth.ts" as unknown as string[] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /changed file/,
  );
});

test("sends PR review request with configured model and endpoint", async () => {
  const requests: Array<{ body: unknown; headers: Headers; url: string }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({
      choices: [{ message: { content: "High risk: missing auth tests at src/auth.ts:42." } }],
    }));
  };

  const result = await runHermesPrReview(
    {
      diffSummary: "Changed login handler to add rate limiting.",
      filesChanged: ["src/auth.ts", "test/auth.test.ts"],
      checkStatus: "CI passed.",
      reviewComments: "Prior comment asked for rate-limit tests.",
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
  assert.equal(result.review, "High risk: missing auth tests at src/auth.ts:42.");
  assert.equal(requests[0]?.url, "https://provider.example/api/v1/chat/completions");
  assert.equal(requests[0]?.headers.get("Authorization"), "Bearer test-key");
  assert.equal((requests[0]?.body as { model?: string }).model, "google/gemini-flash-1.5");

  const body = requests[0]?.body as {
    messages?: Array<{ content?: string; role?: string }>;
  };
  const systemPrompt = body.messages?.[0]?.content ?? "";
  const userPrompt = body.messages?.[1]?.content ?? "";

  assert.match(systemPrompt, /test-gap reviewer/);
  assert.match(systemPrompt, /complexity/);
  assert.match(systemPrompt, /missing tests/i);
  assert.match(systemPrompt, /file:line/);
  assert.match(systemPrompt, /Never emit secrets/);
  assert.match(userPrompt, /Changed login handler/);
  assert.match(userPrompt, /src\/auth\.ts/);
  assert.match(userPrompt, /CI passed/);
});

test("redacts secret-like inputs before calling AI provider", async () => {
  const requests: Array<{ body: { messages?: Array<{ content?: string }> } }> = [];
  const fetchMock: typeof fetch = async (_url, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Review used redacted inputs only." } }],
    }));
  };

  await runHermesPrReview(
    {
      diffSummary: "Fixed token=secret-value and postgres://user:pass@example/db with sk-testsecretvalue123456.",
      filesChanged: ["src/auth.ts"],
      checkStatus: "token=secret-value",
      reviewComments: "password=hunter2value",
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
      choices: [{ message: { content: "OpenRouter fallback review." } }],
    }));
  };

  const result = await runHermesPrReview(
    { diffSummary: "Changed login handler.", filesChanged: ["src/auth.ts"] },
    { GROQ_API_KEY: "groq-key", OPENROUTER_API_KEY: "or-key" },
    { fetch: fetchMock },
  );

  assert.equal(result.provider, "openrouter");
  assert.equal(result.review, "OpenRouter fallback review.");
  // fetchWithPolicy retries a 429 against the same provider once before the
  // provider chain moves on, so Groq is hit twice before OpenRouter is tried.
  assert.deepEqual(calledUrls, [
    "https://api.groq.com/openai/v1/chat/completions",
    "https://api.groq.com/openai/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions",
  ]);
});
