import assert from "node:assert/strict";
import test from "node:test";
import { buildGithubPrReviewDashboard } from "../src/github-pr-review.js";

test("builds PR review dashboard from persisted PR file and review metadata", () => {
  const dashboard = buildGithubPrReviewDashboard([
    {
      approvalReviews: 1,
      architectureFiles: 1,
      backendFiles: 2,
      changesRequestedReviews: 0,
      checkCount: 3,
      failedChecks: 0,
      fileCount: 5,
      files: [
        "docs/architecture.md",
        "apps/web/app/api/github/webhook/route.ts",
        "packages/db/src/github-pr-review.ts",
        "packages/db/test/github-pr-review.test.ts",
        "apps/web/app/page.tsx",
      ],
      frontendFiles: 1,
      htmlUrl: "https://github.com/salescode/devrank-os/pull/7",
      infraFiles: 0,
      mergedAt: "2026-06-23T08:00:00.000Z",
      number: 7,
      passedChecks: 3,
      pendingChecks: 0,
      repoFullName: "salescode/devrank-os",
      reviewComments: 3,
      reviews: 1,
      securityFiles: 0,
      state: "closed",
      successfulChecks: 3,
      testFiles: 1,
      title: "Add GitHub PR review dashboard",
      totalAdditions: 250,
      totalChanges: 320,
      totalDeletions: 70,
      updatedAt: "2026-06-23T07:30:00.000Z",
    },
    {
      approvalReviews: 0,
      architectureFiles: 0,
      backendFiles: 1,
      changesRequestedReviews: 1,
      checkCount: 2,
      failedChecks: 1,
      fileCount: 24,
      files: [
        "apps/web/proxy.ts",
        "apps/web/app/api/auth/route.ts",
        "packages/db/src/schema.ts",
      ],
      frontendFiles: 0,
      htmlUrl: "https://github.com/salescode/devrank-os/pull/8",
      infraFiles: 1,
      mergedAt: null,
      number: 8,
      passedChecks: 1,
      pendingChecks: 0,
      repoFullName: "salescode/devrank-os",
      reviewComments: 8,
      reviews: 2,
      securityFiles: 2,
      state: "open",
      successfulChecks: 1,
      testFiles: 0,
      title: "Auth refactor",
      totalAdditions: 720,
      totalChanges: 900,
      totalDeletions: 180,
      updatedAt: "2026-06-23T09:00:00.000Z",
    },
  ]);

  assert.equal(dashboard.totals.pullRequests, 2);
  assert.equal(dashboard.totals.filesChanged, 29);
  assert.equal(dashboard.totals.highRiskPullRequests, 1);
  assert.equal(dashboard.totals.passingCiPullRequests, 1);
  assert.equal(dashboard.totals.failingCiPullRequests, 1);
  assert.equal(dashboard.pullRequests[0]?.riskLevel, "medium");
  assert.equal(dashboard.pullRequests[0]?.testQuality, "strong");
  assert.equal(dashboard.pullRequests[0]?.reviewState, "approved");
  assert.equal(dashboard.pullRequests[0]?.mergeStatus, "merged");
  assert.equal(dashboard.pullRequests[0]?.architectureImpact, "high");
  assert.equal(dashboard.pullRequests[0]?.ciHealth, "passing");
  assert.equal(dashboard.pullRequests[0]?.ciChecks, 3);
  assert.match(dashboard.pullRequests[0]?.ciSummary ?? "", /3 of 3/);
  assert.match(dashboard.pullRequests[0]?.resumeWorthyImpact ?? "", /Strong resume evidence/);
  assert.equal(dashboard.pullRequests[1]?.riskLevel, "high");
  assert.equal(dashboard.pullRequests[1]?.testQuality, "missing");
  assert.equal(dashboard.pullRequests[1]?.reviewState, "changes-requested");
  assert.equal(dashboard.pullRequests[1]?.ciHealth, "failing");
  assert.match(dashboard.pullRequests[1]?.securityIssues.join(" ") ?? "", /Security-sensitive/);
  assert.match(dashboard.pullRequests[1]?.resumeWorthyImpact ?? "", /Not resume-ready/);
});

test("does not award full CI credit when checks are missing or pending", () => {
  const base = {
    approvalReviews: 1,
    architectureFiles: 0,
    backendFiles: 1,
    changesRequestedReviews: 0,
    failedChecks: 0,
    fileCount: 2,
    files: ["src/index.ts", "src/index.test.ts"],
    frontendFiles: 0,
    htmlUrl: null,
    infraFiles: 0,
    mergedAt: null,
    number: 9,
    passedChecks: 0,
    repoFullName: "salescode/devrank-os",
    reviewComments: 0,
    reviews: 1,
    securityFiles: 0,
    state: "open",
    successfulChecks: 0,
    testFiles: 1,
    title: "Add bounded CI evidence",
    totalAdditions: 20,
    totalChanges: 25,
    totalDeletions: 5,
    updatedAt: "2026-06-25T00:00:00.000Z",
  };
  const dashboard = buildGithubPrReviewDashboard([
    {
      ...base,
      checkCount: 0,
      pendingChecks: 0,
    },
    {
      ...base,
      number: 10,
      checkCount: 1,
      pendingChecks: 1,
    },
  ]);
  const unavailable = dashboard.pullRequests[0];
  const pending = dashboard.pullRequests[1];

  assert.equal(unavailable?.ciHealth, "unavailable");
  assert.equal(pending?.ciHealth, "pending");
  assert.equal((pending?.prQualityScore ?? 0) - (unavailable?.prQualityScore ?? 0), 3);
});

test("does not treat neutral or skipped check-runs as passing CI", () => {
  const dashboard = buildGithubPrReviewDashboard([
    {
      approvalReviews: 1,
      architectureFiles: 0,
      backendFiles: 1,
      changesRequestedReviews: 0,
      checkCount: 2,
      failedChecks: 0,
      fileCount: 2,
      files: ["src/index.ts", "src/index.test.ts"],
      frontendFiles: 0,
      htmlUrl: null,
      infraFiles: 0,
      mergedAt: null,
      number: 11,
      passedChecks: 0,
      pendingChecks: 0,
      repoFullName: "salescode/devrank-os",
      reviewComments: 0,
      reviews: 1,
      securityFiles: 0,
      state: "open",
      successfulChecks: 2,
      testFiles: 1,
      title: "Add neutral check handling",
      totalAdditions: 20,
      totalChanges: 25,
      totalDeletions: 5,
      updatedAt: "2026-06-25T00:00:00.000Z",
    },
  ]);

  assert.equal(dashboard.pullRequests[0]?.ciHealth, "inconclusive");
  assert.match(dashboard.pullRequests[0]?.ciSummary ?? "", /neutral or skipped/);
});
