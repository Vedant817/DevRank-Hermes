import test from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../src/redaction.js";

test("redacts common secrets before cloud usage", () => {
  const result = redactSecrets([
    "OPENAI_API_KEY=sk-testsecretvalue123456",
    "DATABASE_URL=postgresql://user:pass@example.com/db",
    "contact me at user@example.com",
    "token=private-value",
  ].join("\n"));

  assert.match(result.text, /\[REDACTED_OPENAI_KEY\]/);
  assert.match(result.text, /\[REDACTED_DATABASE_URL\]/);
  assert.match(result.text, /\[REDACTED_EMAIL\]/);
  assert.match(result.text, /token=\[REDACTED_SECRET\]/);
  assert.equal(result.redactions.length >= 4, true);
});

test("redacts private customer and Jira references before evidence storage", () => {
  const result = redactSecrets([
    "Debugged ACME-1842 for customer_id=acme-bank",
    "clientName=Contoso tenant=private-workspace",
  ].join("\n"));

  assert.match(result.text, /\[REDACTED_JIRA_REFERENCE\]/);
  assert.match(result.text, /customer=\[REDACTED_CUSTOMER_REFERENCE\]/);
  assert.match(result.text, /client=\[REDACTED_CUSTOMER_REFERENCE\]/);
  assert.match(result.text, /tenant=\[REDACTED_CUSTOMER_REFERENCE\]/);
  assert.equal(result.redactions.includes("[REDACTED_JIRA_REFERENCE]"), true);
  assert.equal(result.redactions.includes("[REDACTED_CUSTOMER_REFERENCE]"), true);
});
