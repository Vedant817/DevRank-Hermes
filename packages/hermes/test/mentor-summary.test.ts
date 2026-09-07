import assert from "node:assert/strict";
import test from "node:test";
import {
  redactHermesPromptText,
  resolveHermesProviderChain,
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

test("redacts secret-like evidence before calling AI provider", async () => {
  const requests: Array<{ body: { messages?: Array<{ content?: string }> } }> = [];
  const fetchMock: typeof fetch = async (_url, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)),
    });

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Use redacted evidence only." } }],
    }));
  };

  await runHermesMentorSummary(
    {
      evidenceSummary: "Fixed token=secret-value and postgres://user:pass@example/db with sk-testsecretvalue123456.",
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

test("redacts Hermes prompt text without changing safe text", () => {
  assert.equal(redactHermesPromptText("Built webhook retry tests."), "Built webhook retry tests.");
  assert.equal(redactHermesPromptText("password=hunter2value"), "password=[REDACTED_SECRET]");
  // Linear/JIRA-style issue IDs are evidence references, not secrets.
  assert.equal(redactHermesPromptText("Ship DEV-123 next."), "Ship DEV-123 next.");
});

test("redacts provider keys, private-key bodies, and JWTs", () => {
  assert.match(
    redactHermesPromptText("key sk-or-v1-abcdefghijklmnop ok"),
    /\[REDACTED_OPENROUTER_KEY\]/,
  );
  assert.doesNotMatch(
    redactHermesPromptText("key sk-or-v1-abcdefghijklmnop ok"),
    /\[REDACTED_OPENAI_KEY\]/,
  );
  assert.match(
    redactHermesPromptText("groq gsk_abcdefghijklmnopqr done"),
    /\[REDACTED_GROQ_KEY\]/,
  );
  assert.match(
    redactHermesPromptText("aws AKIAIOSFODNN7EXAMPLE ok"),
    /\[REDACTED_AWS_KEY\]/,
  );
  assert.match(
    redactHermesPromptText("aws ASIAIOSFODNN7EXAMPLE ok"),
    /\[REDACTED_AWS_KEY\]/,
  );
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKC\n-----END RSA PRIVATE KEY-----";
  assert.equal(redactHermesPromptText(pem), "[REDACTED_PRIVATE_KEY]");
  assert.match(
    redactHermesPromptText("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c here"),
    /\[REDACTED_JWT\]/,
  );
  assert.match(
    redactHermesPromptText("upper GHP_abcdefghijklmnopqrstuvwx done"),
    /\[REDACTED_GITHUB_TOKEN\]/,
  );
});

test("rejects non-string evidence before calling AI provider", async () => {
  await assert.rejects(
    runHermesMentorSummary(
      { evidenceSummary: undefined as unknown as string, weakestLanes: ["DSA"] },
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

test("rejects when no provider API key is configured", async () => {
  await assert.rejects(
    runHermesMentorSummary(
      { evidenceSummary: "Evidence.", weakestLanes: ["DSA"] },
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

test("defaults to Groq as the primary provider when GROQ_API_KEY is set", () => {
  const chain = resolveHermesProviderChain({
    GROQ_API_KEY: "groq-key",
    OPENROUTER_API_KEY: "or-key",
  });

  assert.equal(chain.length, 2);
  assert.equal(chain[0]?.name, "groq");
  assert.equal(chain[0]?.baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(chain[0]?.model, "openai/gpt-oss-120b");
  assert.equal(chain[0]?.apiKey, "groq-key");
  assert.equal(chain[1]?.name, "openrouter");
  assert.equal(chain[1]?.apiKey, "or-key");
});

test("uses only the fallback provider when GROQ_API_KEY is absent", () => {
  const chain = resolveHermesProviderChain({ OPENROUTER_API_KEY: "or-key" });

  assert.equal(chain.length, 1);
  assert.equal(chain[0]?.name, "openrouter");
});

test("uses only Groq when no fallback provider key is configured", () => {
  const chain = resolveHermesProviderChain({ GROQ_API_KEY: "groq-key" });

  assert.equal(chain.length, 1);
  assert.equal(chain[0]?.name, "groq");
});

test("honors GROQ_BASE_URL and GROQ_MODEL overrides", () => {
  const chain = resolveHermesProviderChain({
    GROQ_API_KEY: "groq-key",
    GROQ_BASE_URL: "https://groq.example/v1",
    GROQ_MODEL: "llama-3.3-70b-versatile",
  });

  assert.equal(chain[0]?.baseUrl, "https://groq.example/v1");
  assert.equal(chain[0]?.model, "llama-3.3-70b-versatile");
});

test("calls Groq first and returns its result without touching the fallback", async () => {
  const calledUrls: string[] = [];
  const fetchMock: typeof fetch = async (url) => {
    calledUrls.push(String(url));

    return new Response(JSON.stringify({
      choices: [{ message: { content: "Groq mentor summary." } }],
    }));
  };

  const result = await runHermesMentorSummary(
    { evidenceSummary: "Shipped a tested endpoint.", weakestLanes: ["Backend/API"] },
    { GROQ_API_KEY: "groq-key", OPENROUTER_API_KEY: "or-key" },
    { fetch: fetchMock },
  );

  assert.equal(result.provider, "groq");
  assert.equal(result.summary, "Groq mentor summary.");
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
      choices: [{ message: { content: "OpenRouter fallback summary." } }],
    }));
  };

  const result = await runHermesMentorSummary(
    { evidenceSummary: "Shipped a tested endpoint.", weakestLanes: ["Backend/API"] },
    { GROQ_API_KEY: "groq-key", OPENROUTER_API_KEY: "or-key" },
    { fetch: fetchMock },
  );

  assert.equal(result.provider, "openrouter");
  assert.equal(result.summary, "OpenRouter fallback summary.");
  // fetchWithPolicy retries a 429 against the same provider once before the
  // provider chain moves on, so Groq is hit twice before OpenRouter is tried.
  assert.deepEqual(calledUrls, [
    "https://api.groq.com/openai/v1/chat/completions",
    "https://api.groq.com/openai/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions",
  ]);
});

test("does not fall back to OpenRouter on non-rate-limit Groq failures", async () => {
  let calls = 0;
  const fetchMock: typeof fetch = async () => {
    calls += 1;

    return new Response("server error", { status: 500 });
  };

  await assert.rejects(
    runHermesMentorSummary(
      { evidenceSummary: "Shipped a tested endpoint.", weakestLanes: ["Backend/API"] },
      { GROQ_API_KEY: "groq-key", OPENROUTER_API_KEY: "or-key" },
      { fetch: fetchMock },
    ),
    /AI provider \(groq\) request failed with 500/,
  );
  // fetchWithPolicy retries a 500 once against the same provider; still no
  // fallback to OpenRouter because the failure was not a 429.
  assert.equal(calls, 2);
});

test("surfaces the rate-limit error when Groq is the only configured provider", async () => {
  const fetchMock: typeof fetch = async () => new Response("rate limited", { status: 429 });

  await assert.rejects(
    runHermesMentorSummary(
      { evidenceSummary: "Shipped a tested endpoint.", weakestLanes: ["Backend/API"] },
      { GROQ_API_KEY: "groq-key" },
      { fetch: fetchMock },
    ),
    /AI provider \(groq\) request failed with 429/,
  );
});
