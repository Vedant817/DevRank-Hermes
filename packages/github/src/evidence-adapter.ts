import type { EvidenceItem } from "@repo/shared";
import type { GithubBackfillResult } from "./types.js";

export const MAX_TRIAL_COMMIT_EVIDENCE = 200;

export function backfillResultToEvidence(result: GithubBackfillResult): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  for (const repo of result.repos) {
    evidence.push({
      id: `github:repo:${repo.id}`,
      source: "github",
      title: `GitHub repository: ${repo.fullName}`,
      summary: [
        `Repository ${repo.fullName} is tracked in GitHub backfill.`,
        repo.language ? `Primary language: ${repo.language}.` : "",
      ].filter(Boolean).join(" "),
      occurredAt: repo.updatedAt ?? repo.pushedAt ?? new Date().toISOString(),
      ...(repo.htmlUrl ? { url: repo.htmlUrl } : {}),
      metadata: {
        repository: repo.fullName,
        language: repo.language,
        kind: "github_repo",
      },
    });
  }

  for (const pullRequest of result.pullRequests) {
    evidence.push({
      id: `github:pull_request:${pullRequest.id}`,
      source: "github",
      title: `GitHub PR ${pullRequest.repoFullName}#${pullRequest.number}: ${pullRequest.title}`,
      summary: [
        `Pull request ${pullRequest.repoFullName}#${pullRequest.number} is ${pullRequest.state}.`,
        pullRequest.mergedAt ? "It has been merged." : "",
      ].filter(Boolean).join(" "),
      occurredAt: pullRequest.updatedAt ?? pullRequest.mergedAt ?? new Date().toISOString(),
      ...(pullRequest.htmlUrl ? { url: pullRequest.htmlUrl } : {}),
      metadata: {
        repository: pullRequest.repoFullName,
        pullRequestNumber: pullRequest.number,
        state: pullRequest.state,
        kind: "github_pull_request",
      },
    });
  }

  let commitCount = 0;

  for (const commit of result.commits) {
    if (commitCount >= MAX_TRIAL_COMMIT_EVIDENCE) {
      break;
    }

    const firstLine = commit.message.split("\n").find((line) => line.trim().length > 0)?.trim()
      ?? "Commit message unavailable";

    evidence.push({
      id: `github:commit:${commit.repoFullName}:${commit.sha}`,
      source: "github",
      title: `GitHub commit ${commit.repoFullName}@${commit.sha.slice(0, 7)}`,
      summary: [
        firstLine,
        commit.branch ? `Branch: ${commit.branch}.` : "",
        commit.authorLogin ? `Author: ${commit.authorLogin}.` : "",
      ].filter(Boolean).join(" "),
      occurredAt: commit.committedAt ?? new Date().toISOString(),
      ...(commit.htmlUrl ? { url: commit.htmlUrl } : {}),
      metadata: {
        repository: commit.repoFullName,
        branch: commit.branch,
        commitSha: commit.sha,
        kind: "github_commit",
      },
    });
    commitCount += 1;
  }

  return evidence;
}
