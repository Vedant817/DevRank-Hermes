import { Octokit } from "@octokit/rest";
import { readRuntimeEnv, requireEnv, type RuntimeEnv } from "@repo/shared";

export function createGithubClient(
  env: RuntimeEnv = readRuntimeEnv(),
): Octokit {
  const { GITHUB_PERSONAL_ACCESS_TOKEN } = requireEnv(
    env,
    ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    "GitHub REST backfill",
  );

  return new Octokit({
    auth: GITHUB_PERSONAL_ACCESS_TOKEN,
  });
}
