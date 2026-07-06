import assert from "node:assert/strict";
import test from "node:test";
import { buildGithubPortfolioDashboard } from "../src/github-portfolio.js";

test("builds GitHub portfolio dashboard from persisted repo profile evidence", () => {
  const dashboard = buildGithubPortfolioDashboard({
    now: new Date("2026-06-23T00:00:00.000Z"),
    rows: [
      {
        commits: 42,
        commitsLast30Days: 8,
        commitsLast90Days: 21,
        fullName: "salescode/devrank-os",
        hasArchitectureDiagram: true,
        hasDeploymentConfig: true,
        hasReadme: true,
        hasTests: true,
        htmlUrl: "https://github.com/salescode/devrank-os",
        language: "TypeScript",
        lastCommitAt: "2026-06-22T00:00:00.000Z",
        mergedPullRequests: 7,
        openPullRequests: 1,
        profileScannedAt: "2026-06-22T00:00:00.000Z",
        pullRequests: 8,
        scanStatus: "scanned",
        techStack: ["Next.js", "TypeScript", "Vercel"],
      },
      {
        commits: 2,
        commitsLast30Days: 0,
        commitsLast90Days: 0,
        fullName: "salescode/tutorial-api",
        hasArchitectureDiagram: false,
        hasDeploymentConfig: false,
        hasReadme: false,
        hasTests: false,
        htmlUrl: "https://github.com/salescode/tutorial-api",
        language: "JavaScript",
        lastCommitAt: "2025-12-01T00:00:00.000Z",
        mergedPullRequests: 0,
        openPullRequests: 0,
        profileScannedAt: "2026-06-22T00:00:00.000Z",
        pullRequests: 0,
        scanStatus: "scanned",
        techStack: ["Node.js"],
      },
      {
        commits: 1,
        commitsLast30Days: 1,
        commitsLast90Days: 1,
        fullName: "salescode/private-client",
        hasArchitectureDiagram: null,
        hasDeploymentConfig: null,
        hasReadme: null,
        hasTests: null,
        htmlUrl: null,
        language: "Python",
        lastCommitAt: "2026-06-21T00:00:00.000Z",
        mergedPullRequests: 0,
        openPullRequests: 0,
        profileScannedAt: "2026-06-22T00:00:00.000Z",
        pullRequests: 0,
        scanStatus: "unavailable",
        techStack: ["Python"],
      },
    ],
  });

  assert.equal(dashboard.totals.repos, 3);
  assert.equal(dashboard.totals.profiledRepos, 2);
  assert.equal(dashboard.totals.unavailableProfiles, 1);
  assert.equal(dashboard.bestRepos[0]?.fullName, "salescode/devrank-os");
  assert.equal(dashboard.bestRepos[0]?.portfolioScore, 97);
  assert.deepEqual(dashboard.bestRepos[0]?.statusLabels, ["This repo is resume-ready."]);
  assert.equal(dashboard.weakRepos[0]?.fullName, "salescode/tutorial-api");
  assert.deepEqual(dashboard.weakRepos[0]?.statusLabels, [
    "This repo needs README.",
    "This repo needs tests.",
    "This repo needs deployed demo.",
    "This repo is too tutorial-like.",
    "This repo does not prove SDE skill yet.",
  ]);
  assert.ok(dashboard.bestRepos.every((repo) => repo.portfolioScore <= 100));
  assert.ok(dashboard.weakRepos.every((repo) => repo.portfolioScore >= 0));
  assert.deepEqual(dashboard.needsReadme.map((repo) => repo.fullName), ["salescode/tutorial-api"]);
  assert.deepEqual(dashboard.needsTests.map((repo) => repo.fullName), ["salescode/tutorial-api"]);
  assert.deepEqual(dashboard.needsDeployment.map((repo) => repo.fullName), ["salescode/tutorial-api"]);
  assert.deepEqual(dashboard.needsArchitectureDiagram.map((repo) => repo.fullName), ["salescode/tutorial-api"]);
  assert.ok(dashboard.techStackDistribution.some((item) => item.technology === "Python" && item.count === 1));
  assert.equal(dashboard.commitConsistency[0]?.status, "consistent");
  assert.equal(dashboard.prQuality[0]?.repoFullName, "salescode/devrank-os");
  assert.equal(dashboard.projectComplexity[0]?.band, "high");
  assert.match(dashboard.weakRepos[1]?.reasons.join(" ") ?? "", /contents access unavailable/i);
});

test("bounds portfolio dashboard scores to the explicit 100-point budget", () => {
  const dashboard = buildGithubPortfolioDashboard({
    now: new Date("2026-06-24T00:00:00.000Z"),
    rows: [
      {
        commits: 1_000,
        commitsLast30Days: 1_000,
        commitsLast90Days: 1_000,
        fullName: "vedant/max-signals",
        hasArchitectureDiagram: true,
        hasDeploymentConfig: true,
        hasReadme: true,
        hasTests: true,
        htmlUrl: "https://github.com/vedant/max-signals",
        language: "TypeScript",
        lastCommitAt: "2026-06-24T00:00:00.000Z",
        mergedPullRequests: 1_000,
        openPullRequests: 0,
        profileScannedAt: "2026-06-24T00:00:00.000Z",
        pullRequests: 1_000,
        scanStatus: "scanned",
        techStack: ["TypeScript", "Next.js", "Postgres", "Vercel", "Redis"],
      },
      {
        commits: Number.NaN,
        commitsLast30Days: 0,
        commitsLast90Days: 0,
        fullName: "vedant/no-signals",
        hasArchitectureDiagram: false,
        hasDeploymentConfig: false,
        hasReadme: false,
        hasTests: false,
        htmlUrl: null,
        language: null,
        lastCommitAt: null,
        mergedPullRequests: 0,
        openPullRequests: 0,
        profileScannedAt: "2026-06-24T00:00:00.000Z",
        pullRequests: -5,
        scanStatus: "scanned",
        techStack: [],
      },
    ],
  });

  const scores = new Map(
    dashboard.bestRepos.map((repo) => [repo.fullName, repo.portfolioScore]),
  );

  assert.equal(scores.get("vedant/max-signals"), 100);
  assert.equal(scores.get("vedant/no-signals"), 0);
  assert.ok([...scores.values()].every((score) => Number.isFinite(score)));
});

test("labels tested backend repos with strong backend depth", () => {
  const dashboard = buildGithubPortfolioDashboard({
    now: new Date("2026-06-24T00:00:00.000Z"),
    rows: [
      {
        commits: 35,
        commitsLast30Days: 5,
        commitsLast90Days: 15,
        fullName: "vedant/orders-api",
        hasArchitectureDiagram: false,
        hasDeploymentConfig: true,
        hasReadme: true,
        hasTests: true,
        htmlUrl: "https://github.com/vedant/orders-api",
        language: "TypeScript",
        lastCommitAt: "2026-06-20T00:00:00.000Z",
        mergedPullRequests: 4,
        openPullRequests: 1,
        profileScannedAt: "2026-06-24T00:00:00.000Z",
        pullRequests: 5,
        scanStatus: "scanned",
        techStack: ["Node.js", "Postgres", "Express"],
      },
    ],
  });
  const repo = dashboard.bestRepos[0];

  assert.ok(repo?.statusLabels.includes("This repo has strong backend depth."));
  assert.ok(!repo?.statusLabels.includes("This repo is too tutorial-like."));
});

test("does not label substring name matches as tutorial-like", () => {
  const strongRepo = {
    commits: 60,
    commitsLast30Days: 6,
    commitsLast90Days: 18,
    hasArchitectureDiagram: true,
    hasDeploymentConfig: true,
    hasReadme: true,
    hasTests: true,
    htmlUrl: null,
    language: "Python",
    lastCommitAt: "2026-06-22T00:00:00.000Z",
    mergedPullRequests: 5,
    openPullRequests: 0,
    profileScannedAt: "2026-06-22T00:00:00.000Z",
    pullRequests: 6,
    scanStatus: "scanned" as const,
    techStack: ["Python", "FastAPI", "Postgres"],
  };
  const dashboard = buildGithubPortfolioDashboard({
    now: new Date("2026-06-23T00:00:00.000Z"),
    rows: [
      { ...strongRepo, fullName: "vedant/deep-learning-model" },
      { ...strongRepo, fullName: "vedant/cyclone-tracker" },
      { ...strongRepo, fullName: "vedant/react-tutorial" },
    ],
  });
  const byName = new Map(dashboard.bestRepos.map((repo) => [repo.fullName, repo]));

  // "learning" / "clone" as substrings of real words must not trigger the label.
  assert.ok(!byName.get("vedant/deep-learning-model")?.statusLabels.includes("This repo is too tutorial-like."));
  assert.ok(!byName.get("vedant/cyclone-tracker")?.statusLabels.includes("This repo is too tutorial-like."));
  // A real tutorial segment still gets labelled.
  assert.ok(byName.get("vedant/react-tutorial")?.statusLabels.includes("This repo is too tutorial-like."));
});
