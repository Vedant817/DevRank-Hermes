import { mock, test } from "node:test";
import assert from "node:assert/strict";

import { IncomingWebhook } from "@slack/webhook";
import { sendDailyPlanToSlack } from "../src/index.js";

test("when SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are set, uses blocks path", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ ok: true, ts: "1.2", channel: "C123", deliveredAt: new Date().toISOString() });

  try {
    const result = await sendDailyPlanToSlack(
      [{ taskKey: "K1", date: "2025-01-15", title: "Task 1", minutes: 30 }],
      { SLACK_BOT_TOKEN: "xoxb-test", SLACK_CHANNEL_ID: "C123" },
    );
    assert.equal(result.method, "blocks");
    assert.equal(result.ts, "1.2");
    assert.equal(result.channel, "C123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("when SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are not set, uses webhook path", async () => {
  const mockSend = mock.method(IncomingWebhook.prototype, "send", async () => ({ text: "" }));
  const sentMessages: string[] = [];
  mockSend.mock.mockImplementation(async (message: { text: string }) => {
    sentMessages.push(message.text);
    return { text: "" };
  });

  try {
    const result = await sendDailyPlanToSlack(
      [{ taskKey: "K1", date: "2025-01-15", title: "Task 1", minutes: 30 }],
      { SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/TEST" },
    );
    assert.equal(result.method, "webhook");
    assert.equal(mockSend.mock.callCount(), 1);
    assert.ok(sentMessages[0]!.includes("Task 1"));
  } finally {
    mockSend.mock.restore();
  }
});
