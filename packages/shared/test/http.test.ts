import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithPolicy } from "../src/http.js";

test("retries safe external requests on retryable responses", async () => {
  let attempts = 0;
  const response = await fetchWithPolicy("https://example.test", {}, {
    fetch: async () => {
      attempts += 1;

      return attempts === 1
        ? new Response("busy", { status: 503 })
        : Response.json({ ok: true });
    },
    sleep: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
});

test("does not replay unsafe requests unless retry is explicitly enabled", async () => {
  let attempts = 0;
  const response = await fetchWithPolicy("https://example.test", {
    method: "POST",
  }, {
    fetch: async () => {
      attempts += 1;
      return new Response("busy", { status: 503 });
    },
    sleep: async () => undefined,
  });

  assert.equal(response.status, 503);
  assert.equal(attempts, 1);
});

test("retries read-only POST requests only when explicitly enabled", async () => {
  let attempts = 0;
  const response = await fetchWithPolicy("https://example.test", {
    method: "POST",
  }, {
    fetch: async () => {
      attempts += 1;

      return attempts === 1
        ? new Response("rate limited", { status: 429 })
        : Response.json({ ok: true });
    },
    retry: true,
    sleep: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
});

test("aborts external requests at the configured deadline", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });

  await assert.rejects(
    fetchWithPolicy("https://example.test", {}, {
      fetch: fetchImpl,
      maxAttempts: 1,
      timeoutMs: 10,
    }),
    /timed out after 10ms/,
  );
});

test("preserves an already-aborted caller signal", async () => {
  const controller = new AbortController();
  controller.abort(new Error("caller cancelled"));

  await assert.rejects(
    fetchWithPolicy("https://example.test", {
      signal: controller.signal,
    }, {
      fetch: async (_input, init) => {
        throw init?.signal?.reason;
      },
    }),
    /caller cancelled/,
  );
});
