import assert from "node:assert/strict";
import test from "node:test";
import { POST, GET, PUT, DELETE } from "../app/api/tasks/log-evidence/route";
import { setRateLimitStore, type RateLimitStore } from "../app/api/_lib/route-utils";

const TEST_TOKEN = "test-planner-token";
const TEST_OWNER = "test-owner";

function setupEnv() {
  const prevToken = process.env.DEVRANK_PLANNER_TOKEN;
  const prevOwner = process.env.DEVRANK_OWNER_ID;
  process.env.DEVRANK_PLANNER_TOKEN = TEST_TOKEN;
  process.env.DEVRANK_OWNER_ID = TEST_OWNER;
  return () => {
    restoreEnv("DEVRANK_PLANNER_TOKEN", prevToken);
    restoreEnv("DEVRANK_OWNER_ID", prevOwner);
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function mockRequest(body: unknown, headers?: Record<string, string>, method = "POST"): Request {
  return new Request("http://localhost/api/tasks/log-evidence", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("POST without auth header returns 401", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest({ title: "x", summary: "y" }, {}));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "missing_authorization");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with invalid bearer token returns 401", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y" },
      { authorization: "Bearer wrong-token" },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "invalid_authorization");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("GET returns 405", async () => {
  const response = await GET();
  const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

  assert.equal(response.status, 405);
  assert.equal(body.error?.code, "method_not_allowed");
});

test("PUT returns 405", async () => {
  const response = await PUT();
  const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

  assert.equal(response.status, 405);
  assert.equal(body.error?.code, "method_not_allowed");
});

test("DELETE returns 405", async () => {
  const response = await DELETE();
  const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

  assert.equal(response.status, 405);
  assert.equal(body.error?.code, "method_not_allowed");
});

test("POST with missing title returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { summary: "y" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "missing_field");
    assert.equal(body.error?.details?.field, "title");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with missing summary returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "missing_field");
    assert.equal(body.error?.details?.field, "summary");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with invalid date format returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y", date: "not-a-date" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "invalid_date");
    assert.equal(body.error?.details?.field, "date");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST rejects impossible calendar dates", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y", date: "2026-02-31" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "invalid_date");

    const yearZeroResponse = await POST(mockRequest(
      { title: "x", summary: "y", date: "0000-01-01" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    assert.equal(yearZeroResponse.status, 400);
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with invalid taskKey returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y", taskKey: "not-hex" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "invalid_task_key");
    assert.equal(body.error?.details?.field, "taskKey");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with secret-like value returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y", secret: "sk-abc123def456ghi789jkl" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "secret_like_value");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with title too long returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x".repeat(201), summary: "y" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "field_too_long");
    assert.equal(body.error?.details?.field, "title");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with invalid url returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y", url: "not-a-url" },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "invalid_url");
    assert.equal(body.error?.details?.field, "url");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with non-JSON body returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const request = new Request("http://localhost/api/tasks/log-evidence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: "not-json",
    });
    const response = await POST(request);
    const result = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(result.error?.code, "invalid_json");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with integer minutes out of range returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y", minutes: 999 },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "invalid_field");
    assert.equal(body.error?.details?.field, "minutes");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST with non-integer minutes returns 400", async () => {
  const restore = setupEnv();
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y", minutes: 30.5 },
      { authorization: `Bearer ${TEST_TOKEN}` },
    ));
    const body = await response.json() as { error?: { code?: string; details?: Record<string, unknown> } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "invalid_field");
    assert.equal(body.error?.details?.field, "minutes");
  } finally {
    restoreRateLimit();
    restore();
  }
});

test("POST without auth returns 401 even when owner is unset", async () => {
  const prevToken = process.env.DEVRANK_PLANNER_TOKEN;
  const prevOwner = process.env.DEVRANK_OWNER_ID;
  process.env.DEVRANK_PLANNER_TOKEN = TEST_TOKEN;
  delete process.env.DEVRANK_OWNER_ID;
  const restoreRateLimit = setRateLimitStore(alwaysAllowStore);

  try {
    const response = await POST(mockRequest(
      { title: "x", summary: "y" },
      {},
    ));
    assert.equal(response.status, 401);
  } finally {
    restoreRateLimit();
    restoreEnv("DEVRANK_PLANNER_TOKEN", prevToken);
    restoreEnv("DEVRANK_OWNER_ID", prevOwner);
  }
});

const alwaysAllowStore: RateLimitStore = async () => ({
  count: 1,
  resetAt: new Date(Date.now() + 60_000).toISOString(),
});
