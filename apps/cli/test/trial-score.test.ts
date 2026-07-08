import assert from "node:assert/strict";
import test from "node:test";
import { computeSdeReadinessSnapshot } from "@repo/scoring";

const testEvidence = [
  {
    id: "evt-1",
    source: "github" as const,
    title: "Backend API work",
    summary: "Built a REST API endpoint with PostgreSQL integration.",
    occurredAt: "2026-06-22T00:00:00.000Z",
    url: "https://github.com/salescode/devrank-os",
  },
  {
    id: "evt-2",
    source: "github" as const,
    title: "Frontend UI pass",
    summary: "Improved React components with Tailwind CSS and accessibility testing.",
    occurredAt: "2026-06-22T01:00:00.000Z",
  },
  {
    id: "evt-3",
    source: "github" as const,
    title: "DSA practice",
    summary: "Solved two medium data structure problems on LeetCode.",
    occurredAt: "2026-06-22T02:00:00.000Z",
  },
];

test("trial:score calls computeSdeReadinessSnapshot and returns expected shape", () => {
  const snapshot = computeSdeReadinessSnapshot(testEvidence, "2026-06-22T03:00:00.000Z");

  assert.ok(typeof snapshot.overall === "number");
  assert.ok(snapshot.overall >= 0 && snapshot.overall <= 100);
  assert.equal(snapshot.generatedAt, "2026-06-22T03:00:00.000Z");
  assert.ok(typeof snapshot.rubricVersion === "string");
  assert.ok(snapshot.rubricVersion.length > 0);
  assert.ok(Array.isArray(snapshot.breakdown));
  assert.ok(snapshot.breakdown.length > 0);

  for (const lane of snapshot.breakdown) {
    assert.ok(typeof lane.label === "string");
    assert.ok(typeof lane.score === "number");
    assert.ok(typeof lane.weight === "number");
    assert.ok(typeof lane.evidenceCount === "number");
    assert.ok(typeof lane.explanation === "string");
  }

  const backendLane = snapshot.breakdown.find((lane) => lane.label === "Backend/API");
  assert.ok(backendLane);
  assert.equal(backendLane.evidenceCount, 1);

  const dsaLane = snapshot.breakdown.find((lane) => lane.label === "DSA");
  assert.ok(dsaLane);
  assert.equal(dsaLane.evidenceCount, 1);
});

test("trial:score returns no evidence count with any rubric lane for empty input", () => {
  const snapshot = computeSdeReadinessSnapshot([]);

  assert.equal(snapshot.overall, 0);
  assert.ok(snapshot.breakdown.every((lane) => lane.evidenceCount === 0));
});

test("trial:score produces a deterministic output for the same input", () => {
  const snapshot1 = computeSdeReadinessSnapshot(testEvidence, "2026-06-22T00:00:00.000Z");
  const snapshot2 = computeSdeReadinessSnapshot(testEvidence, "2026-06-22T00:00:00.000Z");

  assert.equal(snapshot1.overall, snapshot2.overall);
  assert.equal(snapshot1.rubricVersion, snapshot2.rubricVersion);
  assert.deepEqual(snapshot1.breakdown, snapshot2.breakdown);
});
