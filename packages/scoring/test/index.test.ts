import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSdeReadinessSnapshot,
  isCurrentSdeReadinessSnapshot,
} from "../src/index.js";
import { sdeReadinessRubric } from "../src/rubrics.js";
import type { EvidenceItem } from "@repo/shared";

test("keeps the scoring rubric weighted to a complete snapshot", () => {
  const totalWeight = sdeReadinessRubric.reduce((total, lane) => total + lane.weight, 0);
  const labels = sdeReadinessRubric.map((lane) => lane.label);

  assert.equal(Math.round(totalWeight * 100), 100);
  assert.ok(labels.includes("Backend/API"));
  assert.ok(labels.includes("Frontend/UI"));
  assert.ok(labels.includes("System Design"));
});

test("detects score snapshots written by an older rubric", () => {
  assert.equal(isCurrentSdeReadinessSnapshot(computeSdeReadinessSnapshot([])), true);
  assert.equal(
    isCurrentSdeReadinessSnapshot({
      overall: 0,
      generatedAt: "2026-06-22T00:00:00.000Z",
      breakdown: [
        {
          label: "Backend/API/System Design",
          score: 0,
          weight: 0.2,
          evidenceCount: 0,
          explanation: "Legacy combined lane.",
        },
      ],
    }),
    false,
  );
});

test("matches scoring keywords as terms instead of substrings", () => {
  const evidence: EvidenceItem[] = [
    {
      id: "1",
      source: "manual",
      title: "Contest writeup",
      summary: "Practiced a contest recap without adding tests.",
      occurredAt: "2026-06-22T00:00:00.000Z",
    },
    {
      id: "2",
      source: "manual",
      title: "Deployment note",
      summary: "Verified CI and deploy evidence.",
      occurredAt: "2026-06-22T00:00:00.000Z",
    },
  ];

  const snapshot = computeSdeReadinessSnapshot(evidence);
  const testingLane = snapshot.breakdown.find((lane) => lane.label === "Code Quality + Testing");
  const devopsLane = snapshot.breakdown.find((lane) => lane.label === "DevOps/Cloud");

  assert.equal(testingLane?.evidenceCount, 1);
  assert.equal(devopsLane?.evidenceCount, 1);
});

test("scores frontend evidence without requiring backend evidence", () => {
  const evidence: EvidenceItem[] = [
    {
      id: "1",
      source: "manual",
      title: "Dashboard UI pass",
      summary: "Improved React accessibility states and responsive CSS.",
      occurredAt: "2026-06-22T00:00:00.000Z",
    },
  ];

  const snapshot = computeSdeReadinessSnapshot(evidence);
  const frontendLane = snapshot.breakdown.find((lane) => lane.label === "Frontend/UI");
  const backendLane = snapshot.breakdown.find((lane) => lane.label === "Backend/API");

  assert.equal(frontendLane?.evidenceCount, 1);
  assert.equal(backendLane?.evidenceCount, 0);
});
