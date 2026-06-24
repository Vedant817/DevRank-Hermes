import assert from "node:assert/strict";
import test from "node:test";
import {
  rateLimit,
  type RateLimitStore,
} from "../app/api/_lib/route-utils";

test("rate limiter ignores spoofed IP headers unless proxy trust is enabled", async () => {
  const previousTrust = process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  delete process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  const key = `spoofed-ip-${Date.now()}`;
  const store = memoryRateLimitStore();

  try {
    assert.equal(await rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.1" }), {
      key,
      limit: 1,
      store,
      windowMs: 60_000,
    }), null);

    const blocked = await rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.2" }), {
      key,
      limit: 1,
      store,
      windowMs: 60_000,
    });

    assert.equal(blocked?.status, 429);
  } finally {
    restoreTrustProxyHeader(previousTrust);
  }
});

test("rate limiter keys authenticated requests by bearer token before IP", async () => {
  const previousTrust = process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  process.env.DEVRANK_TRUST_PROXY_IP_HEADERS = "true";
  const key = `auth-${Date.now()}`;
  const store = memoryRateLimitStore();

  try {
    assert.equal(await rateLimit(requestWithHeaders({
      authorization: "Bearer one",
      "x-forwarded-for": "198.51.100.1",
    }), {
      key,
      limit: 1,
      store,
      windowMs: 60_000,
    }), null);

    const sameAuthBlocked = await rateLimit(requestWithHeaders({
      authorization: "Bearer one",
      "x-forwarded-for": "198.51.100.2",
    }), {
      key,
      limit: 1,
      store,
      windowMs: 60_000,
    });

    assert.equal(sameAuthBlocked?.status, 429);
    assert.equal(await rateLimit(requestWithHeaders({
      authorization: "Bearer two",
      "x-forwarded-for": "198.51.100.1",
    }), {
      key,
      limit: 1,
      store,
      windowMs: 60_000,
    }), null);
  } finally {
    restoreTrustProxyHeader(previousTrust);
  }
});

test("rate limiter can explicitly trust proxy IP headers", async () => {
  const previousTrust = process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  process.env.DEVRANK_TRUST_PROXY_IP_HEADERS = "true";
  const key = `trusted-ip-${Date.now()}`;
  const store = memoryRateLimitStore();

  try {
    assert.equal(await rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.1" }), {
      key,
      limit: 1,
      store,
      windowMs: 60_000,
    }), null);
    assert.equal(await rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.2" }), {
      key,
      limit: 1,
      store,
      windowMs: 60_000,
    }), null);

    const blocked = await rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.1" }), {
      key,
      limit: 1,
      store,
      windowMs: 60_000,
    });

    assert.equal(blocked?.status, 429);
  } finally {
    restoreTrustProxyHeader(previousTrust);
  }
});

test("rate limiter does not persist raw trusted IP addresses in bucket keys", async () => {
  const previousTrust = process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  process.env.DEVRANK_TRUST_PROXY_IP_HEADERS = "true";
  let bucketKey = "";

  try {
    await rateLimit(requestWithHeaders({ "x-real-ip": "198.51.100.42" }), {
      key: "hashed-ip",
      limit: 1,
      store: async (input) => {
        bucketKey = input.bucketKey;
        return {
          count: 1,
          resetAt: new Date(Date.now() + input.windowMs).toISOString(),
        };
      },
      windowMs: 60_000,
    });

    assert.match(bucketKey, /^hashed-ip:ip:[a-f0-9]{24}$/);
    assert.doesNotMatch(bucketKey, /198\.51\.100\.42/);
  } finally {
    restoreTrustProxyHeader(previousTrust);
  }
});

test("rate limiter fails closed when distributed enforcement is unavailable", async () => {
  const response = await rateLimit(requestWithHeaders({}), {
    key: "unavailable",
    limit: 1,
    store: async () => {
      throw new Error("database unavailable");
    },
    windowMs: 60_000,
  });

  assert.equal(response?.status, 503);
  assert.equal((await response?.json())?.error?.code, "rate_limit_unavailable");
});

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("https://devrank.example/api/test", { headers });
}

function restoreTrustProxyHeader(value: string | undefined) {
  if (value === undefined) {
    delete process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
    return;
  }

  process.env.DEVRANK_TRUST_PROXY_IP_HEADERS = value;
}

function memoryRateLimitStore(): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return async ({ bucketKey, windowMs }) => {
    const now = Date.now();
    const current = buckets.get(bucketKey);
    const bucket = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(bucketKey, bucket);

    return {
      count: bucket.count,
      resetAt: new Date(bucket.resetAt).toISOString(),
    };
  };
}
