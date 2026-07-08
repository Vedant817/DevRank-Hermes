import assert from "node:assert/strict";
import test from "node:test";

interface SlackPayload {
  type: string;
  user?: { id: string; name?: string };
  actions?: Array<{
    action_id: string;
    value: string;
    block_id?: string;
  }>;
  response_url?: string;
  message?: { ts?: string };
  container?: { message_ts?: string };
}

function parseSlackPayload(rawBody: string): SlackPayload | undefined {
  const match = rawBody.match(/^payload=(.+)$/);

  if (!match) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(decodeURIComponent(match[1]!)) as SlackPayload;
    return decoded;
  } catch {
    return undefined;
  }
}

test("correctly parses URL-encoded JSON payload from payload= form field", () => {
  const payload = { type: "block_actions", user: { id: "U123" } };
  const encoded = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const result = parseSlackPayload(encoded);
  assert.deepEqual(result, payload);
});

test("returns undefined for non-matching input", () => {
  assert.equal(parseSlackPayload("not_payload_field=true"), undefined);
});

test("returns undefined for invalid JSON", () => {
  assert.equal(parseSlackPayload("payload={invalid_json}"), undefined);
});
