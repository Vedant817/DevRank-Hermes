import assert from "node:assert/strict";
import test from "node:test";
import { sendSlackBlocks, updateSlackMessage } from "../src/interactive-client.js";

function makeEnv(overrides?: Record<string, string>): Record<string, string> {
  return { SLACK_BOT_TOKEN: "xoxb-test-token", SLACK_CHANNEL_ID: "C123456", ...overrides };
}

test("sendSlackBlocks constructs correct request to Slack API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://slack.com/api/chat.postMessage");
    assert.equal((init!.headers as Record<string, string>)["Authorization"], "Bearer xoxb-test-token");
    assert.equal((init!.headers as Record<string, string>)["Content-Type"], "application/json");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.channel, "C123456");
    assert.deepEqual(body.blocks, [{ type: "section", text: { type: "mrkdwn", text: "test" } }]);
    return Response.json({ ok: true, ts: "123456.789", channel: "C123456" });
  };

  try {
    const result = await sendSlackBlocks(
      [{ type: "section", text: { type: "mrkdwn", text: "test" } }],
      makeEnv(),
    );
    assert.equal(result.ts, "123456.789");
    assert.equal(result.channel, "C123456");
    assert.ok(typeof result.deliveredAt === "string");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendSlackBlocks throws on non-ok response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 500 });

  try {
    await assert.rejects(
      () => sendSlackBlocks([], makeEnv()),
      /Slack API returned 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendSlackBlocks throws on Slack API error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: false, error: "not_in_channel" });

  try {
    await assert.rejects(
      () => sendSlackBlocks([], makeEnv()),
      /Slack API error: not_in_channel/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateSlackMessage POSTs to response_url", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://hooks.slack.com/actions/T123");
    assert.equal(init!.method, "POST");
    return new Response(null, { status: 200 });
  };

  try {
    await updateSlackMessage("https://hooks.slack.com/actions/T123", []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateSlackMessage throws on error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 500 });

  try {
    await assert.rejects(
      () => updateSlackMessage("https://hooks.slack.com/actions/T123", []),
      /Slack response_url returned 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
