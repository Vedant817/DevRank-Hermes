import assert from "node:assert/strict";
import test from "node:test";
import {
  backfillLinear,
  type LinearGraphqlExecutor,
} from "../src/backfill.js";

test("paginates Linear projects and issues independently without truncation", async () => {
  const variables: Array<Record<string, unknown>> = [];
  const responses = [
    {
      organization: { id: "org-1", name: "DevRank", urlKey: "devrank" },
      projects: {
        nodes: [project("project-1")],
        pageInfo: { endCursor: null, hasNextPage: false },
      },
      issues: {
        nodes: [issue("issue-1")],
        pageInfo: { endCursor: "issue-cursor-1", hasNextPage: true },
      },
    },
    {
      organization: { id: "org-1", name: "DevRank", urlKey: "devrank" },
      issues: {
        nodes: [issue("issue-2")],
        pageInfo: { endCursor: null, hasNextPage: false },
      },
    },
  ];
  const graphql: LinearGraphqlExecutor = async <T>(_query: string, pageVariables: Record<string, unknown>) => {
    variables.push(pageVariables);
    return responses.shift() as T;
  };

  const result = await backfillLinear(250, graphql);

  assert.deepEqual(result.projects.map((item) => item.id), ["project-1"]);
  assert.deepEqual(result.issues.map((item) => item.id), ["issue-1", "issue-2"]);
  assert.equal(result.issues[1]?.workspaceId, "org-1");
  assert.deepEqual(variables, [
    {
      first: 100,
      includeIssues: true,
      includeProjects: true,
      issuesAfter: null,
      projectsAfter: null,
    },
    {
      first: 100,
      includeIssues: true,
      includeProjects: false,
      issuesAfter: "issue-cursor-1",
      projectsAfter: null,
    },
  ]);
});

test("rejects a paginated Linear response without a continuation cursor", async () => {
  const graphql: LinearGraphqlExecutor = async <T>() => ({
    organization: null,
    projects: {
      nodes: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    },
    issues: {
      nodes: [],
      pageInfo: { endCursor: null, hasNextPage: true },
    },
  }) as T;

  await assert.rejects(
    backfillLinear(100, graphql),
    /issues page has no end cursor/,
  );
});

test("accepts the requested Linear workspace by id, name, or URL key", async () => {
  for (const workspace of ["org-1", "DevRank", "devrank"]) {
    const graphql: LinearGraphqlExecutor = async <T>() => ({
      organization: { id: "org-1", name: "DevRank", urlKey: "devrank" },
      projects: {
        nodes: [],
        pageInfo: { endCursor: null, hasNextPage: false },
      },
      issues: {
        nodes: [],
        pageInfo: { endCursor: null, hasNextPage: false },
      },
    }) as T;

    await backfillLinear({ first: 25, workspace }, graphql);
  }
});

test("rejects a Linear token scoped to a different requested workspace", async () => {
  const graphql: LinearGraphqlExecutor = async <T>() => ({
    organization: { id: "org-1", name: "DevRank", urlKey: "devrank" },
    projects: {
      nodes: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    },
    issues: {
      nodes: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    },
  }) as T;

  await assert.rejects(
    backfillLinear({ workspace: "other-workspace" }, graphql),
    /not requested workspace "other-workspace"/,
  );
});

function project(id: string) {
  return {
    id,
    name: id,
    progress: 0,
    state: "planned",
    team: { id: "team-1", key: "DEV", name: "Platform" },
    url: `https://linear.app/project/${id}`,
  };
}

function issue(id: string) {
  return {
    assignee: { name: "Vedant" },
    id,
    identifier: id.toUpperCase(),
    priority: 2,
    project: { id: "project-1" },
    state: { name: "Todo" },
    team: { id: "team-1", key: "DEV", name: "Platform" },
    title: id,
    updatedAt: "2026-06-25T00:00:00.000Z",
    url: `https://linear.app/issue/${id}`,
  };
}
