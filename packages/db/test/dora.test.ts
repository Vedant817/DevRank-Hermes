import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDoraMetrics,
  type DoraComputationInput,
} from "../src/dora.js";

function makeInput(overrides: Partial<DoraComputationInput> = {}): DoraComputationInput {
  return {
    windowStart: "2026-06-15T00:00:00.000Z",
    windowEnd: "2026-06-22T00:00:00.000Z",
    releases: [],
    commits: [],
    pullRequests: [],
    prChecks: [],
    workflowRuns: [],
    ...overrides,
  };
}

test("computeDoraMetrics returns zero metrics for empty input", () => {
  const metrics = computeDoraMetrics(makeInput());

  assert.equal(metrics.leadTimeForChanges.value, 0);
  assert.equal(metrics.changeFailureRate.value, 0);
  assert.equal(metrics.deploymentFrequency.value, 0);
  assert.equal(metrics.deploymentFrequency.confidence, "insufficient_data");
  assert.equal(metrics.mttr.status, "not_computed");
  assert.ok(metrics.mttr.reason.length > 0);
  assert.equal(metrics.windowStart, "2026-06-15T00:00:00.000Z");
  assert.equal(metrics.windowEnd, "2026-06-22T00:00:00.000Z");
});

test("computeDoraMetrics measures deployment frequency from releases", () => {
  const metrics = computeDoraMetrics(makeInput({
    releases: [
      { id: 1, repoId: 101, tagName: "v1", name: "v1", htmlUrl: "", publishedAt: "2026-06-16T00:00:00.000Z" },
      { id: 2, repoId: 101, tagName: "v2", name: "v2", htmlUrl: "", publishedAt: "2026-06-18T00:00:00.000Z" },
      { id: 3, repoId: 101, tagName: "v3", name: "v3", htmlUrl: "", publishedAt: "2026-06-20T00:00:00.000Z" },
    ],
  }));

  assert.equal(metrics.deploymentFrequency.value, 3);
  assert.equal(metrics.deploymentFrequency.confidence, "measured");
});

test("computeDoraMetrics computed change failure rate from pr checks and workflow runs", () => {
  const metrics = computeDoraMetrics(makeInput({
    prChecks: [
      { conclusion: "success" },
      { conclusion: "success" },
      { conclusion: "failure" },
    ],
    workflowRuns: [
      { conclusion: "success" },
      { conclusion: "timed_out" },
    ],
  }));

  assert.equal(metrics.changeFailureRate.value, 0.4);
});

test("computeDoraMetrics ignores null conclusions in change failure rate", () => {
  const metrics = computeDoraMetrics(makeInput({
    prChecks: [
      { conclusion: null },
      { conclusion: "success" },
    ],
    workflowRuns: [
      { conclusion: null },
    ],
  }));

  assert.equal(metrics.changeFailureRate.value, 0);
});

test("computeDoraMetrics computes lead time from merged pull requests and commits", () => {
  const metrics = computeDoraMetrics(makeInput({
    pullRequests: [
      { repoId: 101, mergedAt: "2026-06-18T12:00:00.000Z" },
    ],
    commits: [
      { repoId: 101, committedAt: "2026-06-18T10:00:00.000Z" },
    ],
  }));

  assert.equal(metrics.leadTimeForChanges.value, 2);
});

test("computeDoraMetrics returns 0 for lead time when no pull requests are merged", () => {
  const metrics = computeDoraMetrics(makeInput({
    pullRequests: [
      { repoId: 101, mergedAt: null },
    ],
    commits: [
      { repoId: 101, committedAt: "2026-06-18T10:00:00.000Z" },
    ],
  }));

  assert.equal(metrics.leadTimeForChanges.value, 0);
});

test("computeDoraMetrics filters releases outside the window", () => {
  const inside = "2026-06-18T00:00:00.000Z";
  const outside = "2026-06-10T00:00:00.000Z";

  const metrics = computeDoraMetrics(makeInput({
    releases: [
      { id: 1, repoId: 101, tagName: "v1", name: "v1", htmlUrl: "", publishedAt: inside },
      { id: 2, repoId: 101, tagName: "v2", name: "v2", htmlUrl: "", publishedAt: outside },
    ],
  }));

  assert.equal(metrics.deploymentFrequency.value, 1);
});
