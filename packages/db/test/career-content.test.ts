import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerContentDashboard } from "../src/career-content.js";

test("builds career content drafts from real evidence and gates resume bullets by evidence age", () => {
  const dashboard = buildCareerContentDashboard({
    generatedAt: "2026-06-23T00:00:00.000Z",
    evidenceRows: [
      {
        createdAt: "2026-05-12T00:00:00.000Z",
        id: "session-1",
        source: "local_session",
        summary: "Implemented GitHub PR dashboard validation.",
        title: "PR dashboard implementation",
        url: null,
      },
    ],
    repoRows: [
      {
        commits: 42,
        fullName: "salescode/devrank-os",
        hasArchitectureDiagram: true,
        hasDeploymentConfig: true,
        hasReadme: true,
        hasTests: true,
        htmlUrl: "https://github.com/salescode/devrank-os",
        language: "TypeScript",
        pullRequests: 8,
        techStack: ["Next.js", "TypeScript", "Postgres"],
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
    ],
    pullRequestRows: [
      {
        filesChanged: 5,
        htmlUrl: "https://github.com/salescode/devrank-os/pull/7",
        mergedAt: "2026-06-22T00:00:00.000Z",
        number: 7,
        repoFullName: "salescode/devrank-os",
        reviews: 1,
        testFiles: 1,
        title: "Add GitHub PR review dashboard",
        totalChanges: 320,
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
    ],
    scoreRow: {
      overall: 72,
      generatedAt: "2026-06-22T00:00:00.000Z",
      breakdown: [
        {
          evidenceCount: 2,
          explanation: "Needs stronger system design proof.",
          label: "System Design",
          score: 45,
          weight: 0.1,
        },
      ],
    },
    storedDraftRows: [],
    taskRows: [
      {
        completedAt: "2026-06-22T12:00:00.000Z",
        minutes: 45,
        planDate: "2026-06-22",
        title: "GitHub/portfolio: improve one repo README.",
      },
    ],
  });

  assert.equal(dashboard.coverage.resumeReady, true);
  assert.equal(dashboard.totals.repositories, 1);
  assert.ok(dashboard.draftsByType.resume_bullet.length > 0);
  assert.ok(dashboard.draftsByType.linkedin_post.length > 0);
  assert.ok(dashboard.draftsByType.x_post.length > 0);
  assert.ok(dashboard.draftsByType.portfolio_description.length > 0);
  assert.ok(dashboard.draftsByType.interview_talking_point.length > 0);
  assert.ok(dashboard.draftsByType.weekly_progress_summary.length > 0);
  assert.match(dashboard.draftsByType.resume_bullet[0]?.body ?? "", /42 commit/);
  assert.match(dashboard.draftsByType.weekly_progress_summary[0]?.body ?? "", /completed 1 tracked learning task/);
  assert.ok(dashboard.drafts.every((draft) => draft.evidence.length > 0));
});

test("does not create fake drafts when no evidence exists", () => {
  const dashboard = buildCareerContentDashboard({
    generatedAt: "2026-06-23T00:00:00.000Z",
    evidenceRows: [],
    pullRequestRows: [],
    repoRows: [],
    storedDraftRows: [],
    taskRows: [],
  });

  assert.equal(dashboard.coverage.resumeReady, false);
  assert.equal(dashboard.drafts.length, 0);
  assert.equal(dashboard.totals.drafts, 0);
});

test("redacts secret-like values from generated drafts", () => {
  const dashboard = buildCareerContentDashboard({
    generatedAt: "2026-06-23T00:00:00.000Z",
    evidenceRows: [],
    pullRequestRows: [],
    repoRows: [
      {
        commits: 3,
        fullName: "salescode/api_key=sk-secretsecretsecret",
        hasArchitectureDiagram: false,
        hasDeploymentConfig: false,
        hasReadme: true,
        hasTests: false,
        htmlUrl: null,
        language: "TypeScript",
        pullRequests: 1,
        techStack: ["Node.js"],
        updatedAt: "2026-06-23T00:00:00.000Z",
      },
    ],
    storedDraftRows: [],
    taskRows: [],
  });

  assert.doesNotMatch(dashboard.drafts.map((draft) => draft.body).join("\n"), /sk-secretsecretsecret/);
  assert.match(dashboard.drafts.map((draft) => draft.body).join("\n"), /\[REDACTED_SECRET\]/);
});
