import assert from "node:assert/strict";
import test from "node:test";
import {
  getContextReadiness,
  invokeLinearBackfill,
  type CommandContext,
  type ModuleExports,
} from "../src/index.js";

test("passes the requested workspace to Linear backfill", async () => {
  const calls: unknown[] = [];
  const moduleExports: ModuleExports = {
    backfillLinear: async (options: unknown) => {
      calls.push(options);
      return { issues: [], projects: [] };
    },
  };
  const context: CommandContext = {
    command: "linear:backfill",
    config: {
      dryRun: true,
      first: 50,
      workspace: "DevRank",
    },
    env: {},
    options: {},
    positionals: [],
  };

  await invokeLinearBackfill(moduleExports, context, "@repo/linear");

  assert.deepEqual(calls, [{
    first: 50,
    workspace: "DevRank",
  }]);
});

test("checks context readiness for the selected provider only", () => {
  const supabase = getContextReadiness({
    CONTEXT_PROVIDER: "supabase",
    DATABASE_URL: "postgresql://example",
    DEVRANK_OWNER_ID: "vedant",
  });
  const supermemory = getContextReadiness({
    CONTEXT_PROVIDER: "supermemory",
    DEVRANK_OWNER_ID: "vedant",
    SUPERMEMORY_API_KEY: "test-key",
  });
  const combined = getContextReadiness({
    CONTEXT_PROVIDER: "combined",
    DEVRANK_OWNER_ID: "vedant",
    SUPERMEMORY_API_KEY: "test-key",
  });

  assert.equal(supabase.ready, true);
  assert.deepEqual(
    supabase.requirements.map((requirement) => requirement.label),
    ["Single-user owner", "Supabase/Postgres connection"],
  );
  assert.equal(supermemory.ready, true);
  assert.deepEqual(
    supermemory.requirements.map((requirement) => requirement.label),
    ["Single-user owner", "Supermemory auth"],
  );
  assert.equal(combined.ready, false);
  assert.deepEqual(
    combined.requirements.map((requirement) => requirement.configured),
    [true, false, true],
  );
});

test("rejects unsupported context provider names", () => {
  assert.throws(
    () => getContextReadiness({ CONTEXT_PROVIDER: "memory-ish" }),
    /Unsupported CONTEXT_PROVIDER "memory-ish"/,
  );
});
