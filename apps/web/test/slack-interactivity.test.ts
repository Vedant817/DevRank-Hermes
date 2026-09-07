import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  parseSlackPayload,
  verifySlackSignature,
} from "../app/api/slack/interactivity/route";

const SIGNING_SECRET = "test-signing-secret";

function sign(rawBody: string, timestamp: string) {
  return `v0=${createHmac("sha256", SIGNING_SECRET).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
}

test("accepts a fresh valid Slack signature", () => {
  const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";
  const timestamp = String(Math.floor(Date.now() / 1_000));

  assert.equal(verifySlackSignature(body, sign(body, timestamp), timestamp, SIGNING_SECRET), true);
});

test("rejects stale timestamps beyond the replay window", () => {
  const body = "payload=%7B%7D";
  const timestamp = String(Math.floor(Date.now() / 1_000) - 10 * 60);

  assert.equal(verifySlackSignature(body, sign(body, timestamp), timestamp, SIGNING_SECRET), false);
});

test("rejects future-dated timestamps beyond clock-skew tolerance", () => {
  const body = "payload=%7B%7D";
  const timestamp = String(Math.floor(Date.now() / 1_000) + 10 * 60);

  assert.equal(verifySlackSignature(body, sign(body, timestamp), timestamp, SIGNING_SECRET), false);
});

test("rejects tampered bodies", () => {
  const timestamp = String(Math.floor(Date.now() / 1_000));

  assert.equal(
    verifySlackSignature("payload=%7B%7D", sign("payload=%7B%22other%22%7D", timestamp), timestamp, SIGNING_SECRET),
    false,
  );
});

test("parses payload with plus-encoded spaces and extra form fields", () => {
  const json = JSON.stringify({ type: "block_actions", actions: [{ action_id: "task_complete", value: "{\"date\":\"2026-09-07\",\"taskKey\":\"abc\"}" }] });
  const encoded = encodeURIComponent(json).replaceAll("%20", "+");
  const parsed = parseSlackPayload(`extra=1&payload=${encoded}&other=2`);

  assert.equal(parsed?.type, "block_actions");
  assert.equal(parsed?.actions?.[0]?.action_id, "task_complete");
});

test("rejects bodies without a payload field", () => {
  assert.equal(parseSlackPayload("foo=1&bar=2"), undefined);
  assert.equal(parseSlackPayload("payload="), undefined);
  assert.equal(parseSlackPayload("payload=%ZZ"), undefined);
});
