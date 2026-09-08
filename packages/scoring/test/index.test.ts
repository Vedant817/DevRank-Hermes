import assert from "node:assert/strict";
import test from "node:test";
import {
  computeScoreTrend,
  computeSdeReadinessSnapshot,
  isCurrentSdeReadinessSnapshot,
} from "../src/index.js";
import {
  sdeReadinessRubric,
  sdeReadinessRubricVersion,
} from "../src/rubrics.js";
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
      rubricVersion: "legacy-v0",
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

test("does not lower lane scores when unrelated evidence is added", () => {
  const backendEvidence: EvidenceItem = {
    id: "backend",
    source: "manual",
    title: "Backend API",
    summary: "Built and deployed a server endpoint.",
    occurredAt: "2026-06-22T00:00:00.000Z",
  };
  const initial = computeSdeReadinessSnapshot([backendEvidence]);
  const withUnrelatedEvidence = computeSdeReadinessSnapshot([
    backendEvidence,
    {
      id: "unrelated",
      source: "manual",
      title: "Study log",
      summary: "Reviewed a topic without rubric keywords.",
      occurredAt: "2026-06-23T00:00:00.000Z",
    },
  ]);
  const initialBackend = initial.breakdown.find((lane) => lane.label === "Backend/API");
  const updatedBackend = withUnrelatedEvidence.breakdown.find((lane) => lane.label === "Backend/API");

  assert.equal(initial.rubricVersion, sdeReadinessRubricVersion);
  assert.equal(updatedBackend?.score, initialBackend?.score);
  assert.equal(updatedBackend?.evidenceCount, initialBackend?.evidenceCount);
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

test("keeps neutral GitLab evidence in the repository portfolio lane", () => {
  const evidence: EvidenceItem[] = [
    {
      id: "gitlab:project:101",
      source: "gitlab",
      title: "Repository: alice/sample",
      summary: "Repository alice/sample is tracked with public visibility.",
      occurredAt: "2026-09-08T00:00:00.000Z",
    },
    {
      id: "gitlab:commit:101:abc",
      source: "gitlab",
      title: "Repository change alice/sample@abcdef1",
      summary: "Update implementation details.",
      occurredAt: "2026-09-08T00:00:00.000Z",
    },
    {
      id: "gitlab:merge-request:101:7",
      source: "gitlab",
      title: "Repository change request alice/sample!7",
      summary: "Update implementation details is opened.",
      occurredAt: "2026-09-08T00:00:00.000Z",
    },
  ];
  const snapshot = computeSdeReadinessSnapshot(evidence);
  const evidenceCount = (label: string) =>
    snapshot.breakdown.find((lane) => lane.label === label)?.evidenceCount;

  assert.equal(evidenceCount("GitHub Portfolio Quality"), 3);
  assert.equal(evidenceCount("Backend/API"), 0);
  assert.equal(evidenceCount("Code Quality + Testing"), 0);
  assert.equal(evidenceCount("DevOps/Cloud"), 0);
  assert.equal(evidenceCount("Communication + Public Proof"), 0);
});

test("computes overall and lane score changes from the latest comparable snapshot", () => {
  const current = computeSdeReadinessSnapshot(
    [
      {
        id: "current",
        source: "manual",
        title: "Backend testing deployment",
        summary: "Built an API with tests and deployed it.",
        occurredAt: "2026-06-24T00:00:00.000Z",
      },
    ],
    "2026-06-24T00:00:00.000Z",
  );
  const previous = computeSdeReadinessSnapshot(
    [
      {
        id: "previous",
        source: "manual",
        title: "Backend API",
        summary: "Built an API.",
        occurredAt: "2026-06-23T00:00:00.000Z",
      },
    ],
    "2026-06-23T00:00:00.000Z",
  );
  const trend = computeScoreTrend(current, [current, previous]);

  assert.ok(trend);
  assert.equal(trend.previousGeneratedAt, previous.generatedAt);
  assert.equal(trend.overallChange, current.overall - previous.overall);
  assert.equal(
    trend.lanes.find((lane) => lane.label === "Code Quality + Testing")?.change,
    68,
  );
  assert.equal(
    trend.lanes.find((lane) => lane.label === "Backend/API")?.change,
    0,
  );
});

test("does not compare snapshots written with a different rubric", () => {
  const current = computeSdeReadinessSnapshot(
    [],
    "2026-06-24T00:00:00.000Z",
  );
  const incompatible = {
    overall: 80,
    generatedAt: "2026-06-23T00:00:00.000Z",
    rubricVersion: "legacy-v0",
    breakdown: [
      {
        label: "Legacy combined lane",
        score: 80,
        weight: 1,
        evidenceCount: 1,
        explanation: "Legacy rubric.",
      },
    ],
  };

  assert.equal(computeScoreTrend(current, [incompatible]), undefined);
});

test("uses the newest compatible prior snapshot regardless of input order", () => {
  const current = computeSdeReadinessSnapshot(
    [],
    "2026-06-24T00:00:00.000Z",
  );
  const older = computeSdeReadinessSnapshot(
    [],
    "2026-06-20T00:00:00.000Z",
  );
  older.overall = 10;
  const newestCompatible = computeSdeReadinessSnapshot(
    [],
    "2026-06-23T00:00:00.000Z",
  );
  newestCompatible.overall = 20;
  const newerIncompatible = {
    overall: 100,
    generatedAt: "2026-06-23T12:00:00.000Z",
    rubricVersion: "legacy-v0",
    breakdown: [],
  };

  const trend = computeScoreTrend(current, [
    older,
    newerIncompatible,
    newestCompatible,
  ]);

  assert.ok(trend);
  assert.equal(trend.previousGeneratedAt, newestCompatible.generatedAt);
  assert.equal(trend.overallChange, -20);
});
