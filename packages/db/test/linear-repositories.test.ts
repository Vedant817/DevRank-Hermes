import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import { upsertLinearBackfill } from "../src/repositories.js";

type SqlCall = {
  text: string;
  values: unknown[];
};

test("upserts Linear workspace metadata and preserves sparse relationships", async () => {
  const { calls, sql } = recordingSql();
  const result = await upsertLinearBackfill(sql, {
    projects: [
      {
        id: "project-1",
        name: "DevRank OS",
        progress: 42,
        state: "started",
        teamId: "team-1",
        teamKey: "DEV",
        teamName: "Platform",
        url: "https://linear.app/devrank/project/devrank-os",
        workspaceId: "workspace-1",
        workspaceName: "DevRank",
        workspaceUrlKey: "devrank",
      },
    ],
    issues: [
      {
        assignee: "Vedant",
        id: "issue-1",
        identifier: "DEV-12",
        priority: 1,
        projectId: "project-1",
        state: "In Progress",
        teamId: "team-1",
        teamKey: "DEV",
        teamName: "Platform",
        title: "Persist Linear webhook",
        updatedAt: "2026-06-22T12:00:00.000Z",
        url: "https://linear.app/devrank/issue/DEV-12",
        workspaceId: "workspace-1",
        workspaceName: "DevRank",
        workspaceUrlKey: "devrank",
      },
    ],
  });

  assert.deepEqual(result, { issues: 1, projects: 1 });

  const workspaceCall = requiredCall(calls, "insert into linear_workspaces");
  assert.deepEqual(workspaceCall.values.slice(0, 3), ["workspace-1", "DevRank", "devrank"]);

  const teamCall = requiredCall(calls, "insert into linear_teams");
  assert.match(normalizedSql(teamCall), /workspace_id = coalesce\(excluded.workspace_id, linear_teams.workspace_id\)/);
  assert.deepEqual(teamCall.values.slice(0, 4), ["team-1", "workspace-1", "Platform", "DEV"]);

  const projectCall = requiredCall(calls, "insert into linear_projects");
  assert.match(normalizedSql(projectCall), /select id from linear_teams where id =/);
  assert.match(normalizedSql(projectCall), /team_id = coalesce\(excluded.team_id, linear_projects.team_id\)/);

  const issueCall = requiredCall(calls, "insert into linear_issues");
  assert.match(normalizedSql(issueCall), /select id from linear_projects where id =/);
  assert.match(normalizedSql(issueCall), /project_id = coalesce\(excluded.project_id, linear_issues.project_id\)/);
  assert.match(normalizedSql(issueCall), /team_id = coalesce\(excluded.team_id, linear_issues.team_id\)/);
  assert.match(normalizedSql(issueCall), /updated_at = coalesce\(excluded.updated_at, linear_issues.updated_at\)/);
  assert.ok(issueCall.values.includes("2026-06-22T12:00:00.000Z"));
});

function recordingSql() {
  const calls: SqlCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({
      text: strings.join("?"),
      values,
    });

    return Promise.resolve([]);
  }) as unknown as SqlClient;

  return { calls, sql };
}

function requiredCall(calls: SqlCall[], pattern: string) {
  const call = calls.find((candidate) => candidate.text.includes(pattern));

  assert.ok(call, `Expected SQL call containing "${pattern}".`);

  return call;
}

function normalizedSql(call: SqlCall) {
  return call.text.replace(/\s+/g, " ").trim();
}
