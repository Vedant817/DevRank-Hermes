import {
  backfillGithubUser,
  backfillResultToEvidence,
  createGithubClient,
} from "@repo/github";
import { computeSdeReadinessSnapshot, explainWeakestLanes } from "@repo/scoring";
import { readRuntimeEnv } from "@repo/shared";
import {
  getEnvValue,
  jsonError,
  jsonOk,
  methodNotAllowed,
  rateLimit,
  readJsonObject,
} from "../../_lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_REPO_LIMIT = 5;
const TRIAL_COMMIT_LIMIT_PER_REPO = 25;
const TRIAL_PULL_REQUEST_LIMIT_PER_REPO = 50;
const USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export function GET() {
  return methodNotAllowed(["POST"]);
}

/**
 * Public trial scoring: paste a GitHub username, get an SDE-readiness
 * snapshot from public data. No auth and no portfolio persistence — the
 * funnel entry point. The distributed abuse-limit counter is the only write.
 */
export async function POST(request: Request) {
  const limitError = await rateLimit(request, {
    key: "trial_score",
    limit: 5,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const body = await readJsonObject(request, { maxBytes: 8 * 1024 });

  if (!body.ok) {
    return body.response;
  }

  const username = body.value.username;

  if (typeof username !== "string" || !USERNAME_PATTERN.test(username.trim())) {
    return jsonError(400, "invalid_username", "username must be a valid GitHub username.", {
      maxLength: 39,
    });
  }

  // getEnvValue rejects shipped placeholders, so a copied .env.example can
  // never serve trial traffic with a publicly-known token.
  const token = getEnvValue("GITHUB_TRIAL_PAT")
    ?? getEnvValue("GITHUB_PERSONAL_ACCESS_TOKEN")
    ?? getEnvValue("GITHUB_TOKEN");

  if (!token) {
    return jsonError(503, "trial_unavailable", "Trial scoring is not configured on this deployment.");
  }

  try {
    const client = createGithubClient({
      ...readRuntimeEnv(),
      GITHUB_PERSONAL_ACCESS_TOKEN: token,
    });
    const backfillResult = await backfillGithubUser(client, username.trim(), {
      commitLimitPerRepo: TRIAL_COMMIT_LIMIT_PER_REPO,
      concurrency: 2,
      minimumRateLimitRemaining: 100,
      prMetadataScan: false,
      profileScan: false,
      pullRequestLimitPerRepo: TRIAL_PULL_REQUEST_LIMIT_PER_REPO,
      repoLimit: TRIAL_REPO_LIMIT,
    });
    const evidence = backfillResultToEvidence(backfillResult);
    const snapshot = computeSdeReadinessSnapshot(evidence);

    return jsonOk({
      username: username.trim(),
      evidenceCount: evidence.length,
      snapshot,
      weakestLanes: explainWeakestLanes(snapshot),
      note: "Trial score uses public GitHub data only. No profile or evidence data was stored.",
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      return jsonError(404, "github_user_not_found", "No public GitHub profile was found for this username.");
    }

    return jsonError(503, "trial_failed", "Trial scoring failed for this username. It may not exist or the API quota is exhausted.");
  }
}
