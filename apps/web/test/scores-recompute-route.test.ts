import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/scores/recompute/route";
import { setRateLimitStore } from "../app/api/_lib/route-utils";

const TEST_TOKEN = "test-score-token";
const TEST_OWNER = "test-owner";

function setupEnv() {
  const prevToken = process.env.DEVRANK_SCORE_RECOMPUTE_TOKEN;
  const prevOwner = process.env.DEVRANK_OWNER_ID;
  const prevGroq = process.env.GROQ_API_KEY;
  const prevOpenRouter = process.env.OPENROUTER_API_KEY;
  const prevAi = process.env.AI_API_KEY;
  process.env.DEVRANK_SCORE_RECOMPUTE_TOKEN = TEST_TOKEN;
  process.env.DEVRANK_OWNER_ID = TEST_OWNER;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.AI_API_KEY;

  return () => {
    restoreEnv("DEVRANK_SCORE_RECOMPUTE_TOKEN", prevToken);
    restoreEnv("DEVRANK_OWNER_ID", prevOwner);
    restoreEnv("GROQ_API_KEY", prevGroq);
    restoreEnv("OPENROUTER_API_KEY", prevOpenRouter);
    restoreEnv("AI_API_KEY", prevAi);
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function alwaysAllowStore() {
  return {
    count: 1,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function mockRequest(body: unknown, url = "http://localhost/api/scores/recompute") {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
}

const evidence = [
  {
    id: "ev-1",
    source: "manual",
    title: "Solved two-sum with hash map",
    summary: "Implemented two-sum with hash map and added unit tests.",
    occurredAt: "2026-09-01T00:00:00.000Z",
  },
];

test("direct evidence recompute ships snapshot without explanation by default", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(async () => alwaysAllowStore());

  try {
    const response = await POST(mockRequest({ evidence }));
    const body = await response.json() as {
      ok: boolean;
      snapshot?: { overall?: number };
      explanation?: unknown;
    };

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(typeof body.snapshot?.overall, "number");
    assert.equal(body.explanation, undefined);
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("explain=true is fail-soft without a provider key", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(async () => alwaysAllowStore());

  try {
    const response = await POST(mockRequest(
      { evidence },
      "http://localhost/api/scores/recompute?explain=true",
    ));
    const body = await response.json() as {
      ok: boolean;
      snapshot?: { overall?: number };
      explanation?: { status?: string };
    };

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(typeof body.snapshot?.overall, "number");
    assert.equal(body.explanation?.status, "unavailable");
  } finally {
    restoreRateLimit();
    restore();
  }
});
