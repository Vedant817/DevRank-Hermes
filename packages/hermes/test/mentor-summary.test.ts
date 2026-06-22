import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveHermesRuntimeConfig,
  runHermesMentorSummary,
} from "../src/index.js";

test("resolves Hermes runtime config from env with OpenRouter defaults", () => {
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
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_BASE_URL: "https://openrouter.example/api/v1/",
      HERMES_MODEL: "google/gemini-flash-1.5",
      HERMES_HTTP_REFERER: "https://devrank.example",
      HERMES_TITLE: "DevRank Production",
    },
    { fetch: fetchMock },
  );

  assert.equal(result.model, "google/gemini-flash-1.5");
  assert.equal(result.summary, "Focus on backend tests next.");
  assert.equal(requests[0]?.url, "https://openrouter.example/api/v1/chat/completions");
  assert.equal(requests[0]?.headers.get("HTTP-Referer"), "https://devrank.example");
  assert.equal(requests[0]?.headers.get("X-Title"), "DevRank Production");
  assert.equal((requests[0]?.body as { model?: string }).model, "google/gemini-flash-1.5");
});

test("rejects empty evidence before calling OpenRouter", async () => {
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
