import assert from "node:assert/strict";
import test from "node:test";
import { isPlaceholderSecret, requireEnv } from "../src/env.js";

test("detects shipped placeholder values case-insensitively", () => {
  assert.equal(isPlaceholderSecret("change_me_to_a_secure_token"), true);
  assert.equal(isPlaceholderSecret("CHANGE_ME"), true);
  assert.equal(isPlaceholderSecret("change-me"), true);
  assert.equal(isPlaceholderSecret("changeme"), true);
  assert.equal(isPlaceholderSecret("replace_me"), true);
  assert.equal(isPlaceholderSecret("REPLACE_ME_LATER"), true);
});

test("accepts real secrets that merely resemble placeholders", () => {
  assert.equal(isPlaceholderSecret("test-key"), false);
  assert.equal(isPlaceholderSecret("xoxb-test-token"), false);
});

test("requireEnv rejects placeholder values instead of accepting them", () => {
  assert.throws(
    () => requireEnv({ DEVRANK_API_TOKEN: "change_me_to_a_secure_token" }, ["DEVRANK_API_TOKEN"], "API auth"),
    /placeholder/,
  );
});

test("requireEnv still reports genuinely missing keys", () => {
  assert.throws(
    () => requireEnv({}, ["DEVRANK_API_TOKEN"], "API auth"),
    /Missing: DEVRANK_API_TOKEN/,
  );
});

test("requireEnv accepts configured non-placeholder values", () => {
  const values = requireEnv({ DEVRANK_API_TOKEN: "real-token-value" }, ["DEVRANK_API_TOKEN"], "API auth");

  assert.equal(values.DEVRANK_API_TOKEN, "real-token-value");
});
