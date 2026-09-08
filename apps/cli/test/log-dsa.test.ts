import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../src/options.js";

test("parseArgs parses log:dsa arguments correctly", () => {
  const parsed = parseArgs([
    "log:dsa",
    "two-sum",
    "--minutes", "45",
    "--notes", "Solved with optimal approach",
    "--date", "2026-07-08",
    "--task-key", "abcdef1234567890",
  ]);

  assert.equal(parsed.commandName, "log:dsa");
  assert.deepEqual(parsed.positionals, ["two-sum"]);
  assert.equal(parsed.options.minutes, "45");
  assert.equal(parsed.options.notes, "Solved with optimal approach");
  assert.equal(parsed.options.date, "2026-07-08");
  assert.equal(parsed.options["task-key"], "abcdef1234567890");
});

test("parseArgs defaults minutes when not provided", () => {
  const parsed = parseArgs(["log:dsa", "number-of-islands"]);

  assert.equal(parsed.commandName, "log:dsa");
  assert.equal(parsed.options.minutes, undefined);
});

test("main makes API request to log-evidence endpoint", async () => {
  const prevApiBaseUrl = process.env.DEVRANK_API_BASE_URL;
  const prevPlannerToken = process.env.DEVRANK_PLANNER_TOKEN;
  process.env.DEVRANK_API_BASE_URL = "http://localhost:9999";
  process.env.DEVRANK_PLANNER_TOKEN = "planner-test-token";

  const { main } = await import("../src/index.js");
  const fetchedUrls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    fetchedUrls.push(typeof input === "string" ? input : input.toString());
    return new Response(JSON.stringify({ ok: true, evidence: { id: "test-id" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await main(["log:dsa", "two-sum", "--minutes", "45"]);

    assert.equal(fetchedUrls.length, 1);
    assert.ok(fetchedUrls[0]?.endsWith("/api/tasks/log-evidence"));
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("DEVRANK_API_BASE_URL", prevApiBaseUrl);
    restoreEnv("DEVRANK_PLANNER_TOKEN", prevPlannerToken);
  }
});

test("main throws CliError when API returns error status", async () => {
  const prevApiBaseUrl = process.env.DEVRANK_API_BASE_URL;
  const prevPlannerToken = process.env.DEVRANK_PLANNER_TOKEN;
  process.env.DEVRANK_API_BASE_URL = "http://localhost:9999";
  process.env.DEVRANK_PLANNER_TOKEN = "planner-test-token";

  const { main } = await import("../src/index.js");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ ok: false, error: { code: "invalid_slug", message: "Unknown DSA slug" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      () => main(["log:dsa", "unknown-slug"]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("404"));
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("DEVRANK_API_BASE_URL", prevApiBaseUrl);
    restoreEnv("DEVRANK_PLANNER_TOKEN", prevPlannerToken);
  }
});

test("main sends correct request body to the API", async () => {
  const prevApiBaseUrl = process.env.DEVRANK_API_BASE_URL;
  const prevPlannerToken = process.env.DEVRANK_PLANNER_TOKEN;
  process.env.DEVRANK_API_BASE_URL = "http://localhost:9999";
  process.env.DEVRANK_PLANNER_TOKEN = "planner-test-token";

  const { main } = await import("../src/index.js");
  const originalFetch = globalThis.fetch;
  let requestBody: string | undefined;
  let authorization: string | undefined;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = init?.body as string | undefined;
    authorization = new Headers(init?.headers).get("authorization") ?? undefined;
    return new Response(JSON.stringify({ ok: true, evidence: { id: "test-id" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await main(["log:dsa", "two-sum", "--minutes", "45", "--notes", "Great solution"]);

    assert.ok(requestBody);
    const parsed = JSON.parse(requestBody);
    assert.equal(parsed.title, "DSA: two-sum");
    assert.equal(parsed.summary, "Great solution");
    assert.equal(parsed.dsaSlug, "two-sum");
    assert.equal(parsed.minutes, 45);
    assert.equal(authorization, "Bearer planner-test-token");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("DEVRANK_API_BASE_URL", prevApiBaseUrl);
    restoreEnv("DEVRANK_PLANNER_TOKEN", prevPlannerToken);
  }
});

test("main rejects impossible or timestamp-shaped DSA dates", async () => {
  const { main } = await import("../src/index.js");

  await assert.rejects(() => main(["log:dsa", "two-sum", "--date", "2026-02-31"]), /real calendar date/);
  await assert.rejects(() => main(["log:dsa", "two-sum", "--date", "0000-01-01"]), /real calendar date/);
  await assert.rejects(() => main(["log:dsa", "two-sum", "--date", "2026-09-08T12:00:00Z"]), /YYYY-MM-DD/);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
