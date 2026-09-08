import assert from "node:assert/strict";
import test from "node:test";
import { evidenceId } from "../app/api/tasks/log-evidence/evidence-id";

test("DSA evidence uses one canonical question and calendar-day identity", () => {
  assert.equal(
    evidenceId("2026-09-08", "Any title", "two-sum"),
    "dsa:two-sum:2026-09-08",
  );
});

test("manual evidence hashes the complete exact title without slug collisions", () => {
  const titles = [
    "C++",
    "C#",
    "same title",
    "Same Title",
    "punctuation!",
    "punctuation?",
    "unicode resume notes",
    `${"long-title-".repeat(10)}first`,
    `${"long-title-".repeat(10)}second`,
  ];
  const ids = titles.map((title) => evidenceId("2026-09-08", title));

  assert.equal(new Set(ids).size, titles.length);
  assert.ok(ids.every((id) => /^[a-f0-9]{64}$/.test(id)));
  assert.equal(ids[0], "08505454daa6540f7629e3d21e9f1c5f3ae1616a8ef0a8c611e6392a2c7606c6");
});
