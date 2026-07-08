import assert from "node:assert/strict";
import test from "node:test";
import { backfillResultToEvidence } from "../src/evidence-adapter.js";
import type { GithubBackfillResult } from "../src/types.js";

test("backfillResultToEvidence maps all fields correctly", () => {
  const result: GithubBackfillResult = {
    repos: [{
      id: 101,
      owner: "salescode",
      name: "devrank-os",
      fullName: "salescode/devrank-os",
      private: false,
      defaultBranch: "master",
      htmlUrl: "https://github.com/salescode/devrank-os",
      language: "TypeScript",
      pushedAt: "2026-06-22T01:00:00Z",
      updatedAt: "2026-06-22T02:00:00Z",
    }],
    pullRequests: [{
      id: 202,
      repoFullName: "salescode/devrank-os",
      number: 7,
      title: "Persist GitHub commit ingestion",
      state: "open",
      headSha: "abc123",
      htmlUrl: "https://github.com/salescode/devrank-os/pull/7",
      mergedAt: null,
      updatedAt: "2026-06-22T03:00:00Z",
    }],
    commits: [{
      authorLogin: "salescode",
      branch: "master",
      committedAt: "2026-06-22T04:00:00Z",
      htmlUrl: "https://github.com/salescode/devrank-os/commit/abc123",
      message: "Add production commit ingestion",
      repoFullName: "salescode/devrank-os",
      sha: "abc123",
    }],
    pullRequestFiles: [],
    pullRequestReviews: [],
    repoProfiles: [],
  };

  const evidence = backfillResultToEvidence(result);

  assert.equal(evidence.length, 3);

  const repoEvidence = evidence.find((e) => e.id === "github:repo:101");
  assert.ok(repoEvidence);
  assert.equal(repoEvidence.source, "github");
  assert.equal(repoEvidence.title, "GitHub repository: salescode/devrank-os");
  assert.match(repoEvidence.summary ?? "", /Primary language: TypeScript/);
  assert.equal(repoEvidence.occurredAt, "2026-06-22T02:00:00Z");
  assert.equal(repoEvidence.url, "https://github.com/salescode/devrank-os");
  assert.deepEqual(repoEvidence.metadata, {
    repository: "salescode/devrank-os",
    language: "TypeScript",
    kind: "github_repo",
  });

  const prEvidence = evidence.find((e) => e.id === "github:pull_request:202");
  assert.ok(prEvidence);
  assert.equal(prEvidence.title, "GitHub PR salescode/devrank-os#7: Persist GitHub commit ingestion");
  assert.equal(prEvidence.occurredAt, "2026-06-22T03:00:00Z");
  assert.deepEqual(prEvidence.metadata, {
    repository: "salescode/devrank-os",
    pullRequestNumber: 7,
    state: "open",
    kind: "github_pull_request",
  });

  const commitEvidence = evidence.find((e) => e.id === "github:commit:salescode/devrank-os:abc123");
  assert.ok(commitEvidence);
  assert.equal(commitEvidence.title, "GitHub commit salescode/devrank-os@abc123");
  assert.match(commitEvidence.summary ?? "", /Add production commit ingestion/);
  assert.match(commitEvidence.summary ?? "", /Branch: master/);
  assert.match(commitEvidence.summary ?? "", /Author: salescode/);
  assert.equal(commitEvidence.occurredAt, "2026-06-22T04:00:00Z");
  assert.deepEqual(commitEvidence.metadata, {
    repository: "salescode/devrank-os",
    branch: "master",
    commitSha: "abc123",
    kind: "github_commit",
  });
});

test("handles empty backfill result", () => {
  const result: GithubBackfillResult = {
    repos: [],
    pullRequests: [],
    commits: [],
    pullRequestFiles: [],
    pullRequestReviews: [],
    repoProfiles: [],
  };

  const evidence = backfillResultToEvidence(result);

  assert.deepEqual(evidence, []);
});

test("handles missing optional fields", () => {
  const result: GithubBackfillResult = {
    repos: [{
      id: 101,
      owner: "salescode",
      name: "devrank-os",
      fullName: "salescode/devrank-os",
      private: false,
      defaultBranch: null,
      htmlUrl: null,
      language: null,
      pushedAt: null,
      updatedAt: null,
    }],
    pullRequests: [{
      id: 202,
      repoFullName: "salescode/devrank-os",
      number: 7,
      title: "PR without metadata",
      state: "closed",
      headSha: null,
      htmlUrl: null,
      mergedAt: "2026-06-22T05:00:00Z",
      updatedAt: null,
    }],
    commits: [{
      authorLogin: null,
      branch: null,
      committedAt: null,
      htmlUrl: null,
      message: "   ",
      repoFullName: "salescode/devrank-os",
      sha: "def456",
    }],
    pullRequestFiles: [],
    pullRequestReviews: [],
    repoProfiles: [],
  };

  const evidence = backfillResultToEvidence(result);

  const repoEvidence = evidence.find((e) => e.id === "github:repo:101");
  assert.ok(repoEvidence);
  assert.equal(repoEvidence.url, undefined);
  assert.doesNotMatch(repoEvidence.summary ?? "", /Primary language/);
  assert.equal(typeof repoEvidence.occurredAt, "string");

  const prEvidence = evidence.find((e) => e.id === "github:pull_request:202");
  assert.ok(prEvidence);
  assert.equal(prEvidence.url, undefined);
  assert.match(prEvidence.summary ?? "", /It has been merged/);
  assert.equal(prEvidence.occurredAt, "2026-06-22T05:00:00Z");

  const commitEvidence = evidence.find((e) => e.id === "github:commit:salescode/devrank-os:def456");
  assert.ok(commitEvidence);
  assert.equal(commitEvidence.url, undefined);
  assert.equal(commitEvidence.summary, "Commit message unavailable");
});

test("caps commit evidence at MAX_TRIAL_COMMIT_EVIDENCE", () => {
  const commits = Array.from({ length: 250 }, (_, i) => ({
    authorLogin: "salescode",
    branch: "master",
    committedAt: `2026-06-22T${String(i).padStart(2, "0")}:00:00Z`,
    htmlUrl: null,
    message: `Commit ${i + 1}`,
    repoFullName: "salescode/devrank-os",
    sha: `sha${i}`,
  }));

  const result: GithubBackfillResult = {
    repos: [],
    pullRequests: [],
    commits,
    pullRequestFiles: [],
    pullRequestReviews: [],
    repoProfiles: [],
  };

  const evidence = backfillResultToEvidence(result);
  const commitEvidence = evidence.filter((e) => e.id.startsWith("github:commit:"));

  assert.equal(commitEvidence.length, 200);
});
