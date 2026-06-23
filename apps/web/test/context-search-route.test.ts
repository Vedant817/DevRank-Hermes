import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/context/search/route";

test("context search rejects one-character queries as client errors", async () => {
  const previousToken = process.env.DEVRANK_CONTEXT_READ_TOKEN;
  process.env.DEVRANK_CONTEXT_READ_TOKEN = "read-token";

  try {
    const response = await POST(new Request("https://devrank.example/api/context/search", {
      body: JSON.stringify({ query: "a" }),
      headers: {
        authorization: "Bearer read-token",
        "content-type": "application/json",
      },
      method: "POST",
    }));
    const body = await response.json() as { error?: { code?: string } };

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "query_too_short");
  } finally {
    if (previousToken === undefined) {
      delete process.env.DEVRANK_CONTEXT_READ_TOKEN;
    } else {
      process.env.DEVRANK_CONTEXT_READ_TOKEN = previousToken;
    }
  }
});
