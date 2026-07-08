import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, timingSafeEqual } from "node:crypto";

const SLACK_SIGNING_VERSION = "v0";
const REPLAY_WINDOW_MS = 5 * 60 * 1_000;

function verifySlackSignature(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string,
  signingSecret: string,
): boolean {
  const timestamp = Number(timestampHeader);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const nowMs = Date.now();
  const thenMs = timestamp * 1_000;

  if (Math.abs(nowMs - thenMs) > REPLAY_WINDOW_MS) {
    return false;
  }

  if (!signatureHeader.startsWith(`${SLACK_SIGNING_VERSION}=`)) {
    return false;
  }

  const baseString = `${SLACK_SIGNING_VERSION}:${timestampHeader}:${rawBody}`;
  const expected = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const received = signatureHeader.slice(SLACK_SIGNING_VERSION.length + 1);

  if (expected.length !== received.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
  } catch {
    return false;
  }
}

test("valid signature with correct HMAC returns true", () => {
  const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";
  const secret = "my_secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `v0:${timestamp}:${body}`;
  const signature = createHmac("sha256", secret).update(baseString).digest("hex");
  const header = `v0=${signature}`;

  assert.equal(verifySlackSignature(body, header, String(timestamp), secret), true);
});

test("invalid signature returns false", () => {
  const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";
  const secret = "my_secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `v0:${timestamp}:${body}`;
  const validSignature = createHmac("sha256", secret).update(baseString).digest("hex");
  const invalidSignature = validSignature.slice(0, -1) + "0";
  const header = `v0=${invalidSignature}`;

  assert.equal(verifySlackSignature(body, header, String(timestamp), secret), false);
});

test("stale timestamp beyond 5 min window returns false", () => {
  const body = "test_body";
  const secret = "my_secret";
  const timestamp = Math.floor(Date.now() / 1000) - 400;
  const baseString = `v0:${timestamp}:${body}`;
  const signature = createHmac("sha256", secret).update(baseString).digest("hex");
  const header = `v0=${signature}`;

  assert.equal(verifySlackSignature(body, header, String(timestamp), secret), false);
});

test("non-numeric timestamp returns false", () => {
  assert.equal(verifySlackSignature("body", "v0=abc", "not_a_number", "secret"), false);
});

test("wrong version prefix returns false", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  assert.equal(verifySlackSignature("body", "v1=abc", String(timestamp), "secret"), false);
});

test("mismatched length returns false", () => {
  const body = "test_body";
  const secret = "my_secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `v0:${timestamp}:${body}`;
  const signature = createHmac("sha256", secret).update(baseString).digest("hex");
  const header = `v0=${signature}extra`;

  assert.equal(verifySlackSignature(body, header, String(timestamp), secret), false);
});
