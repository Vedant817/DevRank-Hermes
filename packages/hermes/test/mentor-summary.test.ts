import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveHermesRuntimeConfig,
  runHermesMentorSummary,
} from "../src/index.js";

test("resolves Hermes runtime config from provider-neutral env", () => {
  assert.deepEqual(resolveHermesRuntimeConfig({
    AI_BASE_URL: "https://llm.example/v1",
    AI_HTTP_REFERER: "https://app.example",
    AI_MODEL: "provider/model",
    AI_TITLE: "DevRank",
  }), {
    baseUrl: "https://llm.example/v1",
    httpReferer: "https://app.example",
    model: "provider/model",
    title: "DevRank",
  });
});

test("falls back to OpenRouter-compatible Hermes defaults", () => {
  assert.deepEqual(resolveHermesRuntimeConfig({ HERMES_MODEL: "anthropic/claude-3.5-haiku" }), {
    baseUrl: "https://openrouter.ai/api/v1",
    httpReferer: "https://devrank-os.local",
    model: "anthropic/claude-3.5-haiku",
    title: "DevRank OS",
  });
});

test("sends mentor summary request with configured model and endpoint", async () => {
  const requests: Array<{ body: unknown; headers: Headers; url: string }> = [];
  const fetchMock: typeof fetch = async (url, init) => {
    requests.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Focus on backend tests next." } }],
    }));
  };

  const result = await runHermesMentorSummary(
    {
      evidenceSummary: "Built a tested webhook ingestion path.",
      weakestLanes: ["Backend/API/System Design"],
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
  assert.equal(result.summary, "Focus on backend tests next.");
  assert.equal(requests[0]?.url, "https://provider.example/api/v1/chat/completions");
  assert.equal(requests[0]?.headers.get("Authorization"), "Bearer test-key");
  assert.equal(requests[0]?.headers.get("HTTP-Referer"), "https://devrank.example");
  assert.equal(requests[0]?.headers.get("X-Title"), "DevRank Production");
  assert.equal((requests[0]?.body as { model?: string }).model, "google/gemini-flash-1.5");
});

test("rejects empty evidence before calling AI provider", async () => {
  await assert.rejects(
    runHermesMentorSummary(
      { evidenceSummary: " ", weakestLanes: ["DSA"] },
      { OPENROUTER_API_KEY: "test-key" },
      {
        fetch: async () => {
          throw new Error("fetch should not be called");
        },
      },
    ),
    /requires evidenceSummary/,
  );
});
