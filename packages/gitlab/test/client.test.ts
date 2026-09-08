import assert from "node:assert/strict";
import test from "node:test";
import { createGitlabClient, DEFAULT_GITLAB_BASE_URL } from "../src/index.js";

test("uses the default API URL and sends an optional token only in PRIVATE-TOKEN", async () => {
  let request: Request | undefined;
  const client = createGitlabClient(
    { GITLAB_TOKEN: "private-secret" },
    {
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json([], { headers: { "X-Next-Page": "2" } });
      },
    },
  );

  const page = await client.getPage("/users/alice/projects", { owned: true });

  assert.equal(request?.url, `${DEFAULT_GITLAB_BASE_URL}/users/alice/projects?owned=true`);
  assert.equal(request?.headers.get("private-token"), "private-secret");
  assert.equal(request?.headers.get("authorization"), null);
  assert.equal(request?.url.includes("private-secret"), false);
  assert.equal(page.nextPage, 2);
});

test("supports a configured base URL and anonymous reads", async () => {
  let request: Request | undefined;
  const client = createGitlabClient(
    { GITLAB_BASE_URL: "https://gitlab.example/api/v4/" },
    {
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json([]);
      },
    },
  );

  await client.getPage("/projects/101/repository/commits", {});

  assert.equal(request?.url, "https://gitlab.example/api/v4/projects/101/repository/commits");
  assert.equal(request?.headers.get("private-token"), null);
});

test("does not leak tokens or response bodies in errors and does not retry auth failures", async () => {
  let calls = 0;
  const client = createGitlabClient(
    { GITLAB_TOKEN: "private-secret" },
    {
      fetch: async () => {
        calls += 1;
        return new Response('{"message":"body-secret"}', { status: 401 });
      },
    },
  );

  await assert.rejects(
    client.getPage("/users/alice/projects", {}),
    (error: Error) => {
      assert.match(error.message, /authentication or authorization failed/);
      assert.doesNotMatch(error.message, /private-secret|body-secret/);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("preserves GitLab's ambiguous 404 and rejects invalid continuation headers", async () => {
  const missing = createGitlabClient({}, {
    fetch: async () => new Response("private details", { status: 404 }),
  });
  const malformed = createGitlabClient({}, {
    fetch: async () => Response.json([], { headers: { "X-Next-Page": "next" } }),
  });

  await assert.rejects(missing.getPage("/projects/101", {}), /not found or is inaccessible/);
  await assert.rejects(malformed.getPage("/projects/101", {}), /invalid X-Next-Page/);
});

test("rejects placeholder tokens and unsafe self-managed base URLs", () => {
  assert.throws(
    () => createGitlabClient({ GITLAB_TOKEN: "change_me" }),
    /placeholder value/,
  );
  assert.throws(
    () => createGitlabClient({ GITLAB_BASE_URL: "http://gitlab.example/api/v4" }),
    /absolute HTTPS URL/,
  );
  assert.throws(
    () => createGitlabClient({ GITLAB_BASE_URL: "https://token@gitlab.example/api/v4" }),
    /without credentials/,
  );
});
