import assert from "node:assert/strict";
import test from "node:test";
import { rateLimit } from "../app/api/_lib/route-utils";

test("rate limiter ignores spoofed IP headers unless proxy trust is enabled", () => {
  const previousTrust = process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  delete process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  const key = `spoofed-ip-${Date.now()}`;

  try {
    assert.equal(rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.1" }), {
      key,
      limit: 1,
      windowMs: 60_000,
    }), null);

    const blocked = rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.2" }), {
      key,
      limit: 1,
      windowMs: 60_000,
    });

    assert.equal(blocked?.status, 429);
  } finally {
    restoreTrustProxyHeader(previousTrust);
  }
});

test("rate limiter keys authenticated requests by bearer token before IP", () => {
  const previousTrust = process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  process.env.DEVRANK_TRUST_PROXY_IP_HEADERS = "true";
  const key = `auth-${Date.now()}`;

  try {
    assert.equal(rateLimit(requestWithHeaders({
      authorization: "Bearer one",
      "x-forwarded-for": "198.51.100.1",
    }), {
      key,
      limit: 1,
      windowMs: 60_000,
    }), null);

    const sameAuthBlocked = rateLimit(requestWithHeaders({
      authorization: "Bearer one",
      "x-forwarded-for": "198.51.100.2",
    }), {
      key,
      limit: 1,
      windowMs: 60_000,
    });

    assert.equal(sameAuthBlocked?.status, 429);
    assert.equal(rateLimit(requestWithHeaders({
      authorization: "Bearer two",
      "x-forwarded-for": "198.51.100.1",
    }), {
      key,
      limit: 1,
      windowMs: 60_000,
    }), null);
  } finally {
    restoreTrustProxyHeader(previousTrust);
  }
});

test("rate limiter can explicitly trust proxy IP headers", () => {
  const previousTrust = process.env.DEVRANK_TRUST_PROXY_IP_HEADERS;
  process.env.DEVRANK_TRUST_PROXY_IP_HEADERS = "true";
  const key = `trusted-ip-${Date.now()}`;

  try {
    assert.equal(rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.1" }), {
      key,
      limit: 1,
      windowMs: 60_000,
    }), null);
    assert.equal(rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.2" }), {
      key,
      limit: 1,
      windowMs: 60_000,
    }), null);

    const blocked = rateLimit(requestWithHeaders({ "x-forwarded-for": "198.51.100.1" }), {
      key,
      limit: 1,
      windowMs: 60_000,
    });

    assert.equal(blocked?.status, 429);
  } finally {
    restoreTrustProxyHeader(previousTrust);
  }
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
