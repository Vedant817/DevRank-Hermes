import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGithubBackfillConfig,
  githubBackfillAuthRequirement,
  invokeGithubBackfill,
  type CommandContext,
  type ModuleExports,
} from "../src/index.js";
import { parseArgs } from "../src/options.js";

test("github backfill config uses token auth and preserves commit limit", () => {
  const parsed = parseArgs([
    "github:backfill",
    "--user",
    "salescode",
    "--commit-limit",
    "5",
    "--pr-metadata-limit",
    "7",
    "--dry-run",
  ]);
  const config = buildGithubBackfillConfig(parsed, {
    DEVRANK_DATABASE_URL: "postgres://example",
    GITHUB_APP_ID: "app-id",
    GITHUB_INSTALLATION_ID: "installation-id",
    GITHUB_PRIVATE_KEY: "private-key",
    GITHUB_TOKEN: "token",
  });

  assert.deepEqual(githubBackfillAuthRequirement.oneOf, [
    ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    ["GITHUB_TOKEN"],
  ]);
  assert.equal(config.authMode, "token");
  assert.equal(config.authEnv, "GITHUB_TOKEN");
  assert.equal(config.commitLimit, 5);
  assert.equal(config.prMetadataLimit, 7);
  assert.equal(buildGithubBackfillConfig(parsed, {
    DEVRANK_DATABASE_URL: "postgres://example",
    GITHUB_APP_ID: "app-id",
    GITHUB_INSTALLATION_ID: "installation-id",
    GITHUB_PRIVATE_KEY: "private-key",
  }).authEnv, undefined);
});

test("github backfill invocation passes configured commit limit", async () => {
  const calls: Array<{
    options: { commitLimitPerRepo?: number; prMetadataLimitPerRepo?: number };
    user: string;
  }> = [];
  const moduleExports: ModuleExports = {
    createGithubClient: (env: Record<string, string>) => ({ env }),
    backfillGithubUser: async (
      _client: unknown,
      user: string,
      options: { commitLimitPerRepo?: number; prMetadataLimitPerRepo?: number },
    ) => {
      calls.push({ options, user });

      return { commits: [], pullRequests: [], repoProfiles: [], repos: [] };
    },
  };
  const context: CommandContext = {
    command: "github:backfill",
    config: {
      commitLimit: 5,
      dryRun: true,
      prMetadataLimit: 7,
      user: "salescode",
    },
    env: {
      GITHUB_TOKEN: "token",
    },
    options: {},
    positionals: [],
  };

  await invokeGithubBackfill(moduleExports, context, "@repo/github");

  assert.equal(calls[0]?.user, "salescode");
  assert.deepEqual(calls[0]?.options, {
    commitLimitPerRepo: 5,
    prMetadataLimitPerRepo: 7,
  });
});
