import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import { claimApiRateLimit } from "../src/rate-limit.js";

test("claims distributed rate limit buckets atomically", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?"), values });

    return Promise.resolve([{
      request_count: 2,
      reset_at: "2026-06-25T12:00:00.000Z",
    }]);
  }) as unknown as SqlClient;

  const result = await claimApiRateLimit(sql, {
    bucketKey: "context_search:auth:abc",
    windowMs: 60_000,
  });
  const statement = calls[0]?.text.replace(/\s+/g, " ").trim() ?? "";

  assert.deepEqual(result, {
    count: 2,
    resetAt: "2026-06-25T12:00:00.000Z",
  });
  assert.match(statement, /on conflict \(bucket_key\) do update/);
  assert.match(statement, /request_count \+ 1/);
  assert.match(statement, /delete from api_rate_limit_buckets/);
  assert.deepEqual(calls[0]?.values, [
    "context_search:auth:abc",
    60_000,
    60_000,
  ]);
});
