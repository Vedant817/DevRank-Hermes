import assert from "node:assert/strict";
import test from "node:test";
import type { Octokit } from "@octokit/rest";
import {
  backfillGithubUser,
  fetchGithubPullRequestMetadata,
  profileGithubRepo,
} from "../src/backfill.js";

test("backfills repos, pull requests, and bounded default-branch commits", async () => {
  const listFiles = () => undefined;
  const listReviews = () => undefined;
  const listReviewComments = () => undefined;
  const commitCalls: unknown[] = [];
  const fileCalls: unknown[] = [];
  const pullCalls: unknown[] = [];
  const repoListCalls: unknown[] = [];
  const octokit = {
    paginate: async (method: unknown, params: unknown) => {
      if (method === listFiles) {
        fileCalls.push(params);
        return [{
          additions: 30,
          changes: 40,
          deletions: 10,
          filename: "apps/web/app/page.tsx",
          previous_filename: undefined,
          status: "modified",
        }, {
          additions: 15,
          changes: 15,
          deletions: 0,
          filename: "apps/web/app/page.test.ts",
          previous_filename: undefined,
          status: "added",
        }];
      }

      if (method === listReviews) {
        return [{
          html_url: "https://github.com/salescode/devrank-os/pull/7#pullrequestreview-303",
          id: 303,
          state: "APPROVED",
          submitted_at: "2026-06-22T04:30:00Z",
          user: { login: "reviewer" },
        }];
      }

      if (method === listReviewComments) {
        return [{
          pull_request_review_id: 303,
        }, {
          pull_request_review_id: 303,
        }];
      }

      return [];
    },
    git: {
      getTree: async () => ({
        data: {
          tree: [
            { path: "README.md", type: "blob" },
            { path: "package.json", type: "blob" },
            { path: "vercel.json", type: "blob" },
            { path: "apps/api/src/index.ts", type: "blob" },
            { path: "apps/api/test/index.test.ts", type: "blob" },
            { path: "packages/platform/docs/architecture.md", type: "blob" },
          ],
          truncated: false,
        },
      }),
    },
    pulls: {
      listFiles,
      list: async (params: unknown) => {
        pullCalls.push(params);

        return {
        data: [{
          id: 202,
          number: 7,
          title: "Persist GitHub commits",
          state: "open",
          html_url: "https://github.com/salescode/devrank-os/pull/7",
          merged_at: null,
          updated_at: "2026-06-22T03:00:00Z",
        }],
        };
      },
      listReviewComments,
      listReviews,
    },
    rateLimit: {
      get: async () => ({
        data: {
          resources: {
            core: {
              remaining: 4_000,
              reset: 1_800_000_000,
            },
          },
        },
      }),
    },
    repos: {
      listCommits: async (params: unknown) => {
        commitCalls.push(params);

        return {
          data: [{
            author: { login: "salescode" },
            commit: {
              author: { date: "2026-06-22T04:00:00Z" },
              committer: { date: "2026-06-22T04:01:00Z" },
              message: "Add production commit ingestion",
            },
            html_url: "https://github.com/salescode/devrank-os/commit/abc123",
            sha: "abc123",
          }],
        };
      },
      listForUser: async (params: unknown) => {
        repoListCalls.push(params);

        return {
        data: [{
          id: 101,
          owner: { login: "salescode" },
          name: "devrank-os",
          full_name: "salescode/devrank-os",
          private: false,
          default_branch: "master",
          html_url: "https://github.com/salescode/devrank-os",
          language: "TypeScript",
          pushed_at: "2026-06-22T01:00:00Z",
          updated_at: "2026-06-22T02:00:00Z",
        }],
        headers: {
          link: '<https://api.github.com/users/salescode/repos?page=2>; rel="next"',
        },
        };
      },
    },
  } as unknown as Octokit;

  const result = await backfillGithubUser(octokit, "salescode", {
    commitLimitPerRepo: 25,
  });

  assert.equal(result.repos.length, 1);
  assert.deepEqual(result.checkpoint, {
    complete: false,
    nextRepoPage: 2,
    repoLimit: 10,
    repoPage: 1,
  });
  assert.equal(result.pullRequests.length, 1);
  assert.deepEqual(result.pullRequestFiles, [{
    additions: 30,
    changes: 40,
    deletions: 10,
    filename: "apps/web/app/page.tsx",
    previousFilename: null,
    pullRequestId: 202,
    pullRequestNumber: 7,
    repoFullName: "salescode/devrank-os",
    status: "modified",
  }, {
    additions: 15,
    changes: 15,
    deletions: 0,
    filename: "apps/web/app/page.test.ts",
    previousFilename: null,
    pullRequestId: 202,
    pullRequestNumber: 7,
    repoFullName: "salescode/devrank-os",
    status: "added",
  }]);
  assert.deepEqual(result.pullRequestReviews, [{
    commentCount: 2,
    htmlUrl: "https://github.com/salescode/devrank-os/pull/7#pullrequestreview-303",
    id: 303,
    pullRequestId: 202,
    pullRequestNumber: 7,
    repoFullName: "salescode/devrank-os",
    reviewerLogin: "reviewer",
    state: "APPROVED",
    submittedAt: "2026-06-22T04:30:00Z",
  }]);
  assert.deepEqual(result.repoProfiles[0], {
    evidencePaths: [
      "apps/api/test/index.test.ts",
      "package.json",
      "packages/platform/docs/architecture.md",
      "README.md",
      "vercel.json",
    ],
    hasArchitectureDiagram: true,
    hasDeploymentConfig: true,
    hasReadme: true,
    hasTests: true,
    repoFullName: "salescode/devrank-os",
    scanError: null,
    scannedAt: result.repoProfiles[0]?.scannedAt,
    scanStatus: "scanned",
    techStack: ["Node.js", "TypeScript", "Vercel"],
  });
  assert.deepEqual(result.commits, [{
    authorLogin: "salescode",
    branch: "master",
    committedAt: "2026-06-22T04:00:00Z",
    htmlUrl: "https://github.com/salescode/devrank-os/commit/abc123",
    message: "Add production commit ingestion",
    repoFullName: "salescode/devrank-os",
    sha: "abc123",
  }]);
  assert.deepEqual(commitCalls[0], {
    owner: "salescode",
    repo: "devrank-os",
    sha: "master",
    per_page: 25,
  });
  assert.deepEqual(repoListCalls[0], {
    direction: "asc",
    page: 1,
    per_page: 10,
    sort: "full_name",
    username: "salescode",
  });
  assert.deepEqual(pullCalls[0], {
    owner: "salescode",
    per_page: 100,
    repo: "devrank-os",
    state: "all",
  });
  assert.deepEqual(fileCalls[0], {
    owner: "salescode",
    pull_number: 7,
    repo: "devrank-os",
    per_page: 100,
  });
});

test("skips empty repositories when GitHub reports no commits", async () => {
  const octokit = {
    paginate: async () => [],
    pulls: {
      list: async () => ({ data: [] }),
      listFiles: async () => [],
      listReviewComments: async () => [],
      listReviews: async () => [],
    },
    git: {
      getTree: async () => ({
        data: {
          tree: [],
          truncated: false,
        },
      }),
    },
    rateLimit: {
      get: async () => ({
        data: {
          resources: {
            core: {
              remaining: 4_000,
              reset: 1_800_000_000,
            },
          },
        },
      }),
    },
    repos: {
      listCommits: async () => {
        const error = new Error("Git Repository is empty.") as Error & { status: number };
        error.status = 409;
        throw error;
      },
      listForUser: async () => ({
        data: [{
          id: 101,
          owner: { login: "salescode" },
          name: "empty",
          full_name: "salescode/empty",
          private: false,
          default_branch: "main",
          html_url: "https://github.com/salescode/empty",
          language: null,
          pushed_at: null,
          updated_at: "2026-06-22T02:00:00Z",
        }],
        headers: {},
      }),
    },
  } as unknown as Octokit;

  const result = await backfillGithubUser(octokit, "salescode");

  assert.equal(result.repos.length, 1);
  assert.deepEqual(result.commits, []);
});

test("marks bounded recursive tree profiles as partial without discarding evidence", async () => {
  const octokit = {
    git: {
      getTree: async () => ({
        data: {
          tree: [
            { path: "packages/api/README.md", type: "blob" },
            { path: "packages/api/test/service.test.ts", type: "blob" },
          ],
          truncated: true,
        },
      }),
    },
  } as unknown as Octokit;

  const profile = await profileGithubRepo(octokit, {
    defaultBranch: "main",
    fullName: "salescode/monorepo",
    htmlUrl: null,
    id: 101,
    language: "TypeScript",
    name: "monorepo",
    owner: "salescode",
    private: false,
    pushedAt: null,
    updatedAt: null,
  });

  assert.equal(profile.scanStatus, "scanned");
  assert.match(profile.scanError ?? "", /limited to 5000 entries/);
  assert.equal(profile.hasReadme, true);
  assert.equal(profile.hasTests, true);
});

test("fails before fan-out when the GitHub rate limit is below the configured floor", async () => {
  let repoCalls = 0;
  const octokit = {
    rateLimit: {
      get: async () => ({
        data: {
          resources: {
            core: {
              remaining: 9,
              reset: 1_800_000_000,
            },
          },
        },
      }),
    },
    repos: {
      listForUser: async () => {
        repoCalls += 1;
        return { data: [], headers: {} };
      },
    },
  } as unknown as Octokit;

  await assert.rejects(
    backfillGithubUser(octokit, "salescode", {
      minimumRateLimitRemaining: 10,
      repoPage: 3,
    }),
    /Retry repo page 3 after/,
  );
  assert.equal(repoCalls, 0);
});

test("webhook metadata refresh does not treat hidden GitHub resources as empty", async () => {
  const error = Object.assign(new Error("Not Found"), { status: 404 });
  const octokit = {
    paginate: async () => {
      throw error;
    },
    pulls: {
      listFiles: () => undefined,
      listReviewComments: () => undefined,
      listReviews: () => undefined,
    },
  } as unknown as Octokit;

  await assert.rejects(
    fetchGithubPullRequestMetadata(
      octokit,
      {
        defaultBranch: "main",
        fullName: "salescode/private",
        htmlUrl: null,
        id: 101,
        language: null,
        name: "private",
        owner: "salescode",
        private: true,
        pushedAt: null,
        updatedAt: null,
      },
      {
        htmlUrl: null,
        id: 202,
        mergedAt: null,
        number: 7,
        repoFullName: "salescode/private",
        state: "open",
        title: "Private change",
        updatedAt: null,
      },
      { ignoreMissing: false },
    ),
    error,
  );
});
