import assert from "node:assert/strict";
import test from "node:test";
import type { Octokit } from "@octokit/rest";
import {
  backfillGithubUser,
  fetchGithubPullRequestMetadata,
} from "../src/backfill.js";

test("backfills repos, pull requests, and bounded default-branch commits", async () => {
  const listForUser = () => undefined;
  const listPulls = () => undefined;
  const listFiles = () => undefined;
  const listReviews = () => undefined;
  const listReviewComments = () => undefined;
  const commitCalls: unknown[] = [];
  const fileCalls: unknown[] = [];
  const octokit = {
    paginate: async (method: unknown, params: unknown) => {
      if (method === listForUser) {
        return [{
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
        }];
      }

      if (method === listPulls) {
        return [{
          id: 202,
          number: 7,
          title: "Persist GitHub commits",
          state: "open",
          html_url: "https://github.com/salescode/devrank-os/pull/7",
          merged_at: null,
          updated_at: "2026-06-22T03:00:00Z",
        }];
      }

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
    pulls: {
      listFiles,
      list: listPulls,
      listReviewComments,
      listReviews,
    },
    repos: {
      getContent: async ({ path }: { path: string }) => ({
        data: path === ""
          ? [
              { name: "README.md", path: "README.md", type: "file" },
              { name: "package.json", path: "package.json", type: "file" },
              { name: "vercel.json", path: "vercel.json", type: "file" },
              { name: "docs", path: "docs", type: "dir" },
              { name: "tests", path: "tests", type: "dir" },
            ]
          : path === "docs"
            ? [{ name: "architecture.md", path: "docs/architecture.md", type: "file" }]
            : [],
      }),
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
      listForUser,
    },
  } as unknown as Octokit;

  const result = await backfillGithubUser(octokit, "salescode", {
    commitLimitPerRepo: 25,
  });

  assert.equal(result.repos.length, 1);
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
      "docs/architecture.md",
      "package.json",
      "README.md",
      "tests",
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
  assert.deepEqual(fileCalls[0], {
    owner: "salescode",
    pull_number: 7,
    repo: "devrank-os",
    per_page: 100,
  });
});

test("skips empty repositories when GitHub reports no commits", async () => {
  const listForUser = () => undefined;
  const listPulls = () => undefined;
  const octokit = {
    paginate: async (method: unknown) => method === listForUser
      ? [{
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
        }]
      : [],
    pulls: {
      list: listPulls,
      listFiles: async () => [],
      listReviewComments: async () => [],
      listReviews: async () => [],
    },
    repos: {
      getContent: async () => ({
        data: [],
      }),
      listCommits: async () => {
        const error = new Error("Git Repository is empty.") as Error & { status: number };
        error.status = 409;
        throw error;
      },
      listForUser,
    },
  } as unknown as Octokit;

  const result = await backfillGithubUser(octokit, "salescode");

  assert.equal(result.repos.length, 1);
  assert.deepEqual(result.commits, []);
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
