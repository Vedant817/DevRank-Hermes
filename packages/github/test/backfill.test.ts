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
  const checkCalls: unknown[] = [];
  const commitCalls: unknown[] = [];
  const fileCalls: unknown[] = [];
  const pullCalls: unknown[] = [];
  const repoListCalls: unknown[] = [];
  const octokit = {
    checks: {
      listForRef: async (params: unknown) => {
        checkCalls.push(params);

        return {
          data: {
            check_runs: [{
              app: { slug: "github-actions" },
              completed_at: "2026-06-22T04:20:00Z",
              conclusion: "success",
              details_url: "https://github.com/salescode/devrank-os/actions/runs/404",
              head_sha: "pr-head-123",
              id: 404,
              name: "test",
              started_at: "2026-06-22T04:10:00Z",
              status: "completed",
            }],
            total_count: 1,
          },
        };
      },
    },
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
          head: { sha: "pr-head-123" },
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
  assert.deepEqual(result.pullRequestChecks, [{
    appSlug: "github-actions",
    completedAt: "2026-06-22T04:20:00Z",
    conclusion: "success",
    detailsUrl: "https://github.com/salescode/devrank-os/actions/runs/404",
    headSha: "pr-head-123",
    id: 404,
    name: "test",
    pullRequestId: 202,
    pullRequestNumber: 7,
    repoFullName: "salescode/devrank-os",
    startedAt: "2026-06-22T04:10:00Z",
    status: "completed",
  }]);
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
  assert.deepEqual(checkCalls[0], {
    filter: "latest",
    owner: "salescode",
    per_page: 100,
    ref: "pr-head-123",
    repo: "devrank-os",
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
    checks: {
      listForRef: async () => {
        throw error;
      },
    },
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
        headSha: "private-head",
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

test("backfill metadata preserves hidden-resource semantics for check runs", async () => {
  const error = Object.assign(new Error("Gone"), { status: 410 });
  const octokit = {
    checks: {
      listForRef: async () => {
        throw error;
      },
    },
    paginate: async () => [],
    pulls: {
      listFiles: () => undefined,
      listReviewComments: () => undefined,
      listReviews: () => undefined,
    },
  } as unknown as Octokit;

  const metadata = await fetchGithubPullRequestMetadata(
    octokit,
    githubRepo(),
    githubPullRequest(),
  );

  assert.deepEqual(metadata, {
    checks: [],
    files: [],
    reviews: [],
  });
});

test("does not treat missing check-run permissions as healthy CI evidence", async () => {
  const error = Object.assign(new Error("Resource not accessible by integration"), { status: 403 });
  const octokit = {
    checks: {
      listForRef: async () => {
        throw error;
      },
    },
    paginate: async () => [],
    pulls: {
      listFiles: () => undefined,
      listReviewComments: () => undefined,
      listReviews: () => undefined,
    },
  } as unknown as Octokit;

  await assert.rejects(
    fetchGithubPullRequestMetadata(
      octokit,
      githubRepo(),
      githubPullRequest(),
    ),
    error,
  );
});

test("resolves missing PR head SHAs and caps returned check-run evidence", async () => {
  const checkCalls: unknown[] = [];
  const pullCalls: unknown[] = [];
  const octokit = {
    checks: {
      listForRef: async (params: unknown) => {
        checkCalls.push(params);

        return {
          data: {
            check_runs: Array.from({ length: 101 }, (_, index) => ({
              app: null,
              completed_at: null,
              conclusion: null,
              details_url: null,
              head_sha: "resolved-head",
              id: index + 1,
              name: `check-${index + 1}`,
              started_at: null,
              status: "queued",
            })),
            total_count: 101,
          },
        };
      },
    },
    paginate: async () => [],
    pulls: {
      get: async (params: unknown) => {
        pullCalls.push(params);
        return {
          data: {
            head: { sha: "resolved-head" },
          },
        };
      },
      listFiles: () => undefined,
      listReviewComments: () => undefined,
      listReviews: () => undefined,
    },
  } as unknown as Octokit;

  const metadata = await fetchGithubPullRequestMetadata(
    octokit,
    githubRepo(),
    {
      ...githubPullRequest(),
      headSha: null,
    },
  );

  assert.equal(metadata.checks.length, 100);
  assert.equal(metadata.checks.at(-1)?.id, 100);
  assert.deepEqual(pullCalls[0], {
    owner: "salescode",
    pull_number: 7,
    repo: "devrank-os",
  });
  assert.deepEqual(checkCalls[0], {
    filter: "latest",
    owner: "salescode",
    per_page: 100,
    ref: "resolved-head",
    repo: "devrank-os",
  });
});

function githubRepo() {
  return {
    defaultBranch: "main",
    fullName: "salescode/devrank-os",
    htmlUrl: null,
    id: 101,
    language: "TypeScript",
    name: "devrank-os",
    owner: "salescode",
    private: false,
    pushedAt: null,
    updatedAt: null,
  };
}

function githubPullRequest() {
  return {
    headSha: "pr-head-123",
    htmlUrl: null,
    id: 202,
    mergedAt: null,
    number: 7,
    repoFullName: "salescode/devrank-os",
    state: "open",
    title: "CI evidence",
    updatedAt: null,
  };
}
