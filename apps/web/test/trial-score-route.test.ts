import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/trial/score/route";
import { setRateLimitStore } from "../app/api/_lib/route-utils";

function request(body: unknown) {
  return new Request("http://localhost/api/trial/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("GET advertises POST only", () => {
  const response = GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("rejects invalid GitHub usernames before touching provider configuration", async () => {
  const restoreRateLimit = setRateLimitStore(async () => ({
    count: 1,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
  }));

  try {
    const response = await POST(request({ username: "-not-valid-" }));
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error?.code, "invalid_username");
  } finally {
    restoreRateLimit();
  }
});

test("fails closed when the trial PAT is a shipped placeholder", async () => {
  const previousTrialPat = process.env.GITHUB_TRIAL_PAT;
  const previousPersonalToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const previousToken = process.env.GITHUB_TOKEN;
  const restoreRateLimit = setRateLimitStore(async () => ({
    count: 1,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
  }));
  process.env.GITHUB_TRIAL_PAT = "github_pat_replace_me";
  delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  delete process.env.GITHUB_TOKEN;

  try {
    const response = await POST(request({ username: "octocat" }));
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(response.status, 503);
    assert.equal(body.error?.code, "trial_unavailable");
  } finally {
    restoreRateLimit();
    restoreEnv("GITHUB_TRIAL_PAT", previousTrialPat);
    restoreEnv("GITHUB_PERSONAL_ACCESS_TOKEN", previousPersonalToken);
    restoreEnv("GITHUB_TOKEN", previousToken);
  }
});

test("scores bounded repository and commit evidence without storing the profile", async () => {
  const previous = process.env.GITHUB_TRIAL_PAT;
  const originalFetch = globalThis.fetch;
  const restoreRateLimit = setRateLimitStore(async () => ({
    count: 1,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
  }));
  process.env.GITHUB_TRIAL_PAT = "github_pat_test_token_not_a_placeholder";
  globalThis.fetch = async (input) => {
    const url = String(input);
    let data: unknown = [];

    if (url.endsWith("/rate_limit")) {
      data = { resources: { core: { remaining: 5_000, reset: Math.floor(Date.now() / 1_000) + 3_600 } } };
    } else if (url.includes("/users/octocat/repos")) {
      data = [{
        id: 7,
        owner: { login: "octocat" },
        name: "proof-repo",
        full_name: "octocat/proof-repo",
        private: false,
        default_branch: "main",
        html_url: "https://github.com/octocat/proof-repo",
        language: "TypeScript",
        pushed_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      }];
    } else if (url.includes("/commits")) {
      data = [{
        sha: "abcdef1234567890",
        html_url: "https://github.com/octocat/proof-repo/commit/abcdef1",
        author: { login: "octocat" },
        commit: {
          message: "Add tested API endpoint",
          author: { date: "2026-09-01T00:00:00.000Z" },
          committer: { date: "2026-09-01T00:00:00.000Z" },
        },
      }];
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await POST(request({ username: "octocat" }));
    const body = await response.json() as {
      ok?: boolean;
      evidenceCount?: number;
      snapshot?: { overall?: number };
      note?: string;
    };
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.evidenceCount, 2);
    assert.equal(typeof body.snapshot?.overall, "number");
    assert.match(body.note ?? "", /No profile or evidence data was stored/);
  } finally {
    restoreRateLimit();
    restoreEnv("GITHUB_TRIAL_PAT", previous);
    globalThis.fetch = originalFetch;
  }
});
