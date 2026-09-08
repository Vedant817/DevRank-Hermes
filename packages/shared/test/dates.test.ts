import assert from "node:assert/strict";
import test from "node:test";
import { isValidDateOnly } from "../src/dates.js";

test("accepts real date-only UTC calendar values", () => {
  assert.equal(isValidDateOnly("2024-02-29"), true);
  assert.equal(isValidDateOnly("2026-09-08"), true);
});

test("rejects impossible, partial, and timestamp-shaped values", () => {
  assert.equal(isValidDateOnly("2026-02-29"), false);
  assert.equal(isValidDateOnly("2026-02-31"), false);
  assert.equal(isValidDateOnly("0000-01-01"), false);
  assert.equal(isValidDateOnly("2026-9-8"), false);
  assert.equal(isValidDateOnly("2026-09-08T12:00:00Z"), false);
});
