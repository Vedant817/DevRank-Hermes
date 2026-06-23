import assert from "node:assert/strict";
import test from "node:test";
import { buildLinearProjectDashboard, parseLinearProjectDashboardFilters } from "../src/linear-dashboard.js";

test("builds Linear project dashboard from persisted projects, issues, and PR proof", () => {
  const dashboard = buildLinearProjectDashboard({
    now: new Date("2026-06-23T00:00:00.000Z"),
    projects: [
      {
        id: "project-1",
        name: "DevRank OS",
        progress: 55,
        state: "started",
        teamName: "Platform",
        url: "https://linear.app/devrank/project/devrank-os",
        workspaceName: "DevRank",
      },
    ],
    issues: [
      {
        assignee: "Vedant",
        id: "issue-1",
        identifier: "DEV-12",
        priority: 1,
        projectId: "project-1",
        projectName: "DevRank OS",
        state: "Blocked",
        syncedAt: "2026-06-22T00:00:00.000Z",
        teamName: "Platform",
        title: "Persist Linear webhook",
        updatedAt: "2026-06-22T00:00:00.000Z",
        url: "https://linear.app/devrank/issue/DEV-12",
        workspaceName: "DevRank",
      },
      {
        assignee: null,
        id: "issue-2",
        identifier: "DEV-13",
        priority: 2,
        projectId: "project-1",
        projectName: "DevRank OS",
        state: "In Progress",
        syncedAt: "2026-06-01T00:00:00.000Z",
        teamName: "Platform",
        title: "Build Linear dashboard",
        updatedAt: "2026-06-01T00:00:00.000Z",
        url: "https://linear.app/devrank/issue/DEV-13",
        workspaceName: "DevRank",
      },
      {
        assignee: "Vedant",
        id: "issue-3",
        identifier: "DEV-14",
        priority: 3,
        projectId: "project-1",
        projectName: "DevRank OS",
        state: "Done",
        syncedAt: "2026-06-20T00:00:00.000Z",
        teamName: "Platform",
        title: "Add PR review dashboard",
        updatedAt: "2026-06-20T00:00:00.000Z",
        url: "https://linear.app/devrank/issue/DEV-14",
        workspaceName: "DevRank",
      },
    ],
    githubProof: [
      {
        mergedAt: "2026-06-21T00:00:00.000Z",
        number: 7,
        repoFullName: "salescode/devrank-os",
        title: "DEV-14 add PR review dashboard",
        updatedAt: "2026-06-21T00:00:00.000Z",
        url: "https://github.com/salescode/devrank-os/pull/7",
      },
    ],
  });

  assert.equal(dashboard.totals.projects, 1);
  assert.equal(dashboard.totals.issues, 3);
  assert.equal(dashboard.totals.blockedIssues, 1);
  assert.equal(dashboard.totals.openIssues, 1);
  assert.equal(dashboard.totals.doneIssues, 1);
  assert.equal(dashboard.totals.highPriorityIssues, 2);
  assert.equal(dashboard.totals.staleIssues, 1);
  assert.equal(dashboard.totals.unownedIssues, 1);
  assert.equal(dashboard.totals.resumeWorthyCompletedIssues, 1);
  assert.equal(dashboard.projects[0]?.teamName, "Platform");
  assert.equal(dashboard.projectGroups[0]?.workspaceName, "DevRank");
  assert.equal(dashboard.projectGroups[0]?.teamName, "Platform");
  assert.equal(dashboard.cycleProgress[0]?.progress, 55);
  assert.equal(dashboard.blockedIssues[0]?.identifier, "DEV-12");
  assert.equal(dashboard.staleIssues[0]?.identifier, "DEV-13");
  assert.equal(dashboard.planningCandidates[0]?.identifier, "DEV-12");
  assert.equal(dashboard.resumeWorthyCompletedIssues[0]?.issue.identifier, "DEV-14");
  assert.equal(dashboard.resumeWorthyCompletedIssues[0]?.proof[0]?.number, 7);
  assert.ok(dashboard.issuesMissingGithubProof.some((issue) => issue.identifier === "DEV-13"));
});

test("redacts secret-like values from Linear dashboard strings", () => {
  const dashboard = buildLinearProjectDashboard({
    now: new Date("2026-06-23T00:00:00.000Z"),
    projects: [
      {
        id: "project-1",
        name: "token=sk-secretsecretsecret",
        progress: null,
        state: "started",
        teamName: null,
        url: null,
        workspaceName: null,
      },
    ],
    issues: [],
    githubProof: [],
  });

  assert.equal(dashboard.projects[0]?.name, "token=[REDACTED_SECRET]");
  assert.equal(dashboard.cycleProgress[0]?.state, "missing");
});

test("filters Linear dashboard by workspace, team, project, status, and priority", () => {
  const dashboard = buildLinearProjectDashboard({
    filters: {
      priority: 1,
      projectId: "project-1",
      status: "blocked",
      teamName: "Platform",
      workspaceName: "DevRank",
    },
    now: new Date("2026-06-23T00:00:00.000Z"),
    projects: [
      {
        id: "project-1",
        name: "DevRank OS",
        progress: 55,
        state: "started",
        teamName: "Platform",
        url: "https://linear.app/devrank/project/devrank-os",
        workspaceName: "DevRank",
      },
      {
        id: "project-2",
        name: "Docs",
        progress: 20,
        state: "planned",
        teamName: "Content",
        url: "https://linear.app/devrank/project/docs",
        workspaceName: "DevRank",
      },
      {
        id: "project-3",
        name: "Billing",
        progress: 10,
        state: "planned",
        teamName: "Platform",
        url: "https://linear.app/other/project/billing",
        workspaceName: "Other",
      },
    ],
    issues: [
      {
        assignee: "Vedant",
        id: "issue-1",
        identifier: "DEV-12",
        priority: 1,
        projectId: "project-1",
        projectName: "DevRank OS",
        state: "Blocked",
        syncedAt: "2026-06-22T00:00:00.000Z",
        teamName: "Platform",
        title: "Persist Linear webhook",
        updatedAt: "2026-06-22T00:00:00.000Z",
        url: "https://linear.app/devrank/issue/DEV-12",
        workspaceName: "DevRank",
      },
      {
        assignee: "Vedant",
        id: "issue-2",
        identifier: "DOC-3",
        priority: 1,
        projectId: "project-2",
        projectName: "Docs",
        state: "Blocked",
        syncedAt: "2026-06-22T00:00:00.000Z",
        teamName: "Content",
        title: "Write docs",
        updatedAt: "2026-06-22T00:00:00.000Z",
        url: "https://linear.app/devrank/issue/DOC-3",
        workspaceName: "DevRank",
      },
      {
        assignee: null,
        id: "issue-3",
        identifier: "BILL-9",
        priority: 2,
        projectId: "project-3",
        projectName: "Billing",
        state: "Done",
        syncedAt: "2026-06-22T00:00:00.000Z",
        teamName: "Platform",
        title: "Finish billing",
        updatedAt: "2026-06-22T00:00:00.000Z",
        url: "https://linear.app/other/issue/BILL-9",
        workspaceName: "Other",
      },
    ],
    githubProof: [],
  });

  assert.deepEqual(dashboard.activeFilters, {
    priority: 1,
    projectId: "project-1",
    status: "blocked",
    teamName: "Platform",
    workspaceName: "DevRank",
  });
  assert.equal(dashboard.totals.projects, 1);
  assert.equal(dashboard.totals.issues, 1);
  assert.equal(dashboard.totals.blockedIssues, 1);
  assert.equal(dashboard.projects[0]?.id, "project-1");
  assert.equal(dashboard.blockedIssues[0]?.identifier, "DEV-12");
  assert.deepEqual(dashboard.projectGroups.map((group) => group.teamName), ["Platform"]);
  assert.deepEqual(dashboard.filterOptions.workspaces, ["DevRank", "Other"]);
  assert.deepEqual(dashboard.filterOptions.teams, ["Content", "Platform"]);
  assert.equal(dashboard.filterOptions.projects.length, 3);
});

test("parses Linear dashboard query filters defensively", () => {
  assert.deepEqual(
    parseLinearProjectDashboardFilters({
      priority: "2",
      project: "project-1",
      status: "open",
      team: " Platform ",
      workspace: " DevRank ",
    }),
    {
      priority: 2,
      projectId: "project-1",
      status: "open",
      teamName: "Platform",
      workspaceName: "DevRank",
    },
  );

  assert.deepEqual(
    parseLinearProjectDashboardFilters({
      priority: "9",
      status: "unknown",
      team: "token=sk-secretsecretsecret",
    }),
    {
      teamName: "token=[REDACTED_SECRET]",
    },
  );
});
