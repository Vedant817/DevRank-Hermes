import type {
  GithubBackfillResult,
  GithubPullRequestFileSummary,
  GithubPullRequestSummary,
} from "./types.js";

export interface GithubSkillEvidence {
  occurredAt: string | null;
  skillCategory: string;
  skillName: string;
  skillSlug: string;
  source: "github_pr";
  sourceId: string;
  summary: string;
  title: string;
}

const skillFileSignals = [
  {
    category: "quality",
    name: "Testing & QA",
    pattern: /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$|\.(test|spec)\.py$/i,
    slug: "testing",
  },
  {
    category: "engineering",
    name: "Backend & API",
    pattern: /(^|\/)(api|server|db|database|worker)\/|route\.[tj]s$|controller|service|repository/i,
    slug: "backend-api",
  },
  {
    category: "engineering",
    name: "Frontend & UI",
    pattern: /(^|\/)(app|pages|components|ui)\/|\.(tsx|jsx|css)$/i,
    slug: "frontend-ui",
  },
  {
    category: "operations",
    name: "DevOps & Infrastructure",
    pattern: /(^|\/)(infra|\.github|deploy|k8s|terraform|migrations?)(\/|$)|vercel\.json$|dockerfile$|docker-compose\.(yml|yaml)$/i,
    slug: "devops-infra",
  },
  {
    category: "security",
    name: "Security",
    pattern: /(^|\/)(auth|security|middleware|secrets?|permissions?|policies?)(\/|\.|$)/i,
    slug: "security",
  },
  {
    category: "communication",
    name: "Documentation",
    pattern: /\.(md|mdx|rst)$|(^|\/)docs?\//i,
    slug: "documentation",
  },
] as const;

export function deriveGithubPrSkillEvidence(
  backfill: Pick<GithubBackfillResult, "pullRequestFiles" | "pullRequests">,
): GithubSkillEvidence[] {
  const filesByPullRequest = new Map<number, GithubPullRequestFileSummary[]>();

  for (const file of backfill.pullRequestFiles) {
    const files = filesByPullRequest.get(file.pullRequestId) ?? [];
    files.push(file);
    filesByPullRequest.set(file.pullRequestId, files);
  }

  return backfill.pullRequests.flatMap((pullRequest) =>
    skillEvidenceForPullRequest(pullRequest, filesByPullRequest.get(pullRequest.id) ?? []),
  );
}

function skillEvidenceForPullRequest(
  pullRequest: GithubPullRequestSummary,
  files: GithubPullRequestFileSummary[],
): GithubSkillEvidence[] {
  if (files.length === 0) {
    return [];
  }

  return skillFileSignals.flatMap((signal) => {
    const matching = files.filter((file) => signal.pattern.test(file.filename));

    if (matching.length === 0) {
      return [];
    }

    return [{
      occurredAt: pullRequest.mergedAt ?? pullRequest.updatedAt,
      skillCategory: signal.category,
      skillName: signal.name,
      skillSlug: signal.slug,
      source: "github_pr" as const,
      // Key on the immutable GitHub PR id so repo renames/transfers do not
      // create a duplicate evidence row for the same pull request.
      sourceId: `github_pr:${pullRequest.id}`,
      summary:
        `PR ${pullRequest.repoFullName}#${pullRequest.number} touched ` +
        `${matching.length} ${signal.name} file(s): ` +
        `${matching.slice(0, 3).map((file) => file.filename).join(", ")}.`,
      title: pullRequest.title,
    }];
  });
}
