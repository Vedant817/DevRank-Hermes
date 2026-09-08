import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitlabBackfillConfig,
  invokeGitlabBackfill,
  type CommandContext,
  type ModuleExports,
} from "../src/index.js";
import { parseArgs } from "../src/options.js";

test("GitLab backfill config keeps token optional and dry-run database-free", () => {
  const parsed = parseArgs([
    "gitlab:backfill",
    "--user",
    "alice",
    "--dry-run",
  ]);
  const config = buildGitlabBackfillConfig(parsed, {
    GITLAB_BASE_URL: "https://gitlab.example/api/v4",
    GITLAB_TOKEN: "private-secret",
  });

  assert.deepEqual(config, {
    databaseEnv: undefined,
    dryRun: true,
    user: "alice",
  });
  assert.equal(JSON.stringify(config).includes("private-secret"), false);
});

test("GitLab backfill invocation uses the dynamic client and validates a dry-run result", async () => {
  const calls: unknown[] = [];
  const result = validResult();
  const moduleExports: ModuleExports = {
    createGitlabClient: (env: unknown) => {
      calls.push({ env });
      return { kind: "gitlab-client" };
    },
    backfillGitlabUser: async (client: unknown, user: unknown) => {
      calls.push({ client, user });
      return result;
    },
  };
  const context = gitlabContext(true);

  assert.equal(
    await invokeGitlabBackfill(moduleExports, context, "@repo/gitlab"),
    result,
  );
  assert.deepEqual(calls[1], {
    client: { kind: "gitlab-client" },
    user: "alice",
  });
});

test("GitLab backfill rejects malformed package results even for dry-runs", async () => {
  const moduleExports: ModuleExports = {
    createGitlabClient: () => ({}),
    backfillGitlabUser: async () => ({ commits: [], mergeRequests: [], projects: [{}] }),
  };

  await assert.rejects(
    invokeGitlabBackfill(moduleExports, gitlabContext(true), "@repo/gitlab"),
    /invalid result shape/,
  );
});

test("persisted GitLab backfill requires database and owner configuration", async () => {
  let called = false;
  const moduleExports: ModuleExports = {
    backfillGitlabUser: async () => {
      called = true;
      return validResult();
    },
  };

  await assert.rejects(
    invokeGitlabBackfill(moduleExports, gitlabContext(false), "@repo/gitlab"),
    /DEVRANK_OWNER_ID.*DEVRANK_DATABASE_URL/,
  );
  assert.equal(called, false);
});

function gitlabContext(dryRun: boolean): CommandContext {
  return {
    command: "gitlab:backfill",
    config: { dryRun, user: "alice" },
    env: {},
    options: {},
    positionals: [],
  };
}

function validResult() {
  return {
    commits: [],
    mergeRequests: [],
    projects: [{
      archived: false,
      defaultBranch: "main",
      emptyRepo: false,
      id: 101,
      lastActivityAt: "2026-09-08T00:00:00.000Z",
      name: "project",
      pathWithNamespace: "alice/project",
      visibility: "public",
      webUrl: "https://gitlab.example/alice/project",
    }],
  };
}
