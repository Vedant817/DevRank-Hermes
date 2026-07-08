import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectionalOutcomeReport } from "../src/index.js";

const scoreSnapshots = [
  { overall: 62, generatedAt: "2024-01-01T00:00:00.000Z" },
  { overall: 71, generatedAt: "2024-01-29T00:00:00.000Z" },
];

const outcomeEvents = [
  { eventType: "application", occurredAt: "2024-01-05T00:00:00.000Z", company: "Acme" },
  { eventType: "application", occurredAt: "2024-01-12T00:00:00.000Z", company: "Globex" },
  { eventType: "application", occurredAt: "2024-01-20T00:00:00.000Z", company: "Initech" },
  { eventType: "interview", occurredAt: "2024-01-22T00:00:00.000Z", company: "Initech" },
  { eventType: "rejection", occurredAt: "2024-03-01T00:00:00.000Z", company: "Acme" },
];

test("produces a descriptive report with score delta and per-type counts", () => {
  const report = buildDirectionalOutcomeReport({
    outcomeEvents,
    scoreSnapshots,
    windowEnd: "2024-02-01T00:00:00.000Z",
    windowStart: "2024-01-01T00:00:00.000Z",
  });

  assert.equal(report.scoreStart, 62);
  assert.equal(report.scoreEnd, 71);
  assert.equal(report.scoreDelta, 9);
  assert.equal(report.windowStart, "2024-01-01T00:00:00.000Z");
  assert.equal(report.windowEnd, "2024-02-01T00:00:00.000Z");
  assert.equal(report.outcomeCounts.application, 3);
  assert.equal(report.outcomeCounts.interview, 1);
  assert.equal(report.outcomeCounts.rejection, undefined);
  assert.equal(report.totalOutcomes, 4);
  assert.match(report.summary, /moved from 62 to 71/);
  assert.match(report.summary, /3 application\(s\) and 1 interview\(s\)/);
});

test("counts all outcomes when no window is provided", () => {
  const report = buildDirectionalOutcomeReport({ outcomeEvents, scoreSnapshots });

  assert.equal(report.totalOutcomes, 5);
  assert.equal(report.outcomeCounts.rejection, 1);
  assert.equal(report.windowStart, null);
  assert.equal(report.windowEnd, null);
});

test("handles a window with zero outcomes without throwing", () => {
  const report = buildDirectionalOutcomeReport({
    outcomeEvents,
    scoreSnapshots,
    windowEnd: "2025-01-01T00:00:00.000Z",
    windowStart: "2025-02-01T00:00:00.000Z",
  });

  assert.equal(report.totalOutcomes, 0);
  assert.deepEqual(report.outcomeCounts, {});
  assert.equal(report.scoreStart, 62);
  assert.match(report.summary, /no outcomes were logged/);
});

test("handles no score snapshots without throwing", () => {
  const report = buildDirectionalOutcomeReport({ outcomeEvents, scoreSnapshots: [] });

  assert.equal(report.scoreStart, null);
  assert.equal(report.scoreEnd, null);
  assert.equal(report.scoreDelta, null);
  assert.equal(report.summary, "No score snapshots available to summarize.");
});

test("handles empty outcome events without throwing", () => {
  const report = buildDirectionalOutcomeReport({ outcomeEvents: [], scoreSnapshots });

  assert.equal(report.totalOutcomes, 0);
  assert.deepEqual(report.outcomeCounts, {});
  assert.equal(report.scoreDelta, 9);
});
