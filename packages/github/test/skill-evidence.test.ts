import assert from "node:assert/strict";
import test from "node:test";
import { deriveGithubPrSkillEvidence } from "../src/skill-evidence.js";

const pullRequest = {
  htmlUrl: "https://github.com/salescode/devrank-os/pull/7",
  id: 700,
  mergedAt: "2026-06-23T08:00:00.000Z",
  number: 7,
  repoFullName: "salescode/devrank-os",
  state: "closed",
  title: "Add webhook retry handling",
  updatedAt: "2026-06-23T07:30:00.000Z",
};

function file(filename: string, pullRequestId = 700, pullRequestNumber = 7) {
  return {
    additions: 10,
    changes: 12,
    deletions: 2,
    filename,
    previousFilename: null,
    pullRequestId,
    pullRequestNumber,
    repoFullName: "salescode/devrank-os",
    status: "modified",
  };
}

test("derives per-skill evidence from PR changed files", () => {
  const evidence = deriveGithubPrSkillEvidence({
    pullRequests: [pullRequest],
    pullRequestFiles: [
      file("packages/db/src/skills.ts"),
      file("packages/db/test/skills.test.ts"),
      file("docs/architecture.md"),
      file("infra/migrations/017_skills_and_skill_evidence.sql"),
    ],
  });
  const slugs = evidence.map((item) => item.skillSlug).sort();

  assert.deepEqual(slugs, ["backend-api", "devops-infra", "documentation", "testing"]);

  const testing = evidence.find((item) => item.skillSlug === "testing");

  assert.equal(testing?.source, "github_pr");
  assert.equal(testing?.sourceId, "github_pr:700");
  assert.equal(testing?.occurredAt, "2026-06-23T08:00:00.000Z");
  assert.match(testing?.summary ?? "", /packages\/db\/test\/skills\.test\.ts/);
  assert.match(testing?.summary ?? "", /salescode\/devrank-os#7/);
});

test("derives no skill evidence for pull requests without imported files", () => {
  const evidence = deriveGithubPrSkillEvidence({
    pullRequests: [pullRequest],
    pullRequestFiles: [],
  });

  assert.deepEqual(evidence, []);
});
