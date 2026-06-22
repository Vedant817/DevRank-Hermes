import assert from "node:assert/strict";
import test from "node:test";
import { computeSdeReadinessSnapshot } from "../src/index.js";
import type { EvidenceItem } from "@repo/shared";

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
