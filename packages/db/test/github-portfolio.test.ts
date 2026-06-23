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
  assert.equal(dashboard.weakRepos[0]?.fullName, "salescode/tutorial-api");
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
