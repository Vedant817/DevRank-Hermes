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
      repoFullName: "salescode/devrank-os",
      reviewComments: 3,
      reviews: 1,
      securityFiles: 0,
      state: "closed",
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
      repoFullName: "salescode/devrank-os",
      reviewComments: 8,
      reviews: 2,
      securityFiles: 2,
      state: "open",
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
  assert.equal(dashboard.pullRequests[0]?.riskLevel, "medium");
  assert.equal(dashboard.pullRequests[0]?.testQuality, "strong");
  assert.equal(dashboard.pullRequests[0]?.reviewState, "approved");
  assert.equal(dashboard.pullRequests[0]?.mergeStatus, "merged");
  assert.equal(dashboard.pullRequests[0]?.architectureImpact, "high");
  assert.match(dashboard.pullRequests[0]?.resumeWorthyImpact ?? "", /Strong resume evidence/);
  assert.equal(dashboard.pullRequests[1]?.riskLevel, "high");
  assert.equal(dashboard.pullRequests[1]?.testQuality, "missing");
  assert.equal(dashboard.pullRequests[1]?.reviewState, "changes-requested");
  assert.match(dashboard.pullRequests[1]?.securityIssues.join(" ") ?? "", /Security-sensitive/);
  assert.match(dashboard.pullRequests[1]?.resumeWorthyImpact ?? "", /Not resume-ready/);
});
