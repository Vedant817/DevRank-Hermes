import {
  fetchWithPolicy,
  isPlaceholderSecret,
  readRuntimeEnv,
  type RuntimeEnv,
} from "@repo/shared";
import type { GitlabClientOptions } from "./types.js";

export const DEFAULT_GITLAB_BASE_URL = "https://gitlab.com/api/v4";

export interface GitlabPage {
  items: unknown[];
  nextPage: number | null;
}

export interface GitlabClient {
  getPage(path: string, query: Record<string, string | number | boolean>): Promise<GitlabPage>;
}

export function createGitlabClient(
  source: NodeJS.ProcessEnv | RuntimeEnv = process.env,
  options: GitlabClientOptions = {},
): GitlabClient {
  const env = readRuntimeEnv(source as NodeJS.ProcessEnv);
  const baseUrl = normalizeBaseUrl(env.GITLAB_BASE_URL);
  const token = env.GITLAB_TOKEN;

  if (token && isPlaceholderSecret(token)) {
    throw new Error("GITLAB_TOKEN still contains a placeholder value.");
  }

  return {
    async getPage(path, query) {
      const url = new URL(`${baseUrl}${path}`);

      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }

      const headers = new Headers({ Accept: "application/json" });

      if (token) {
        headers.set("PRIVATE-TOKEN", token);
      }

      let response: Response;

      try {
        response = await fetchWithPolicy(url, { headers }, { fetch: options.fetch });
      } catch {
        throw new Error("GitLab API request failed before a response was received.");
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw gitlabResponseError(response.status);
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("GitLab API returned invalid JSON.");
      }

      if (!Array.isArray(payload)) {
        throw new Error("GitLab API returned an invalid collection response.");
      }

      return {
        items: payload,
        nextPage: parseNextPage(response.headers.get("x-next-page")),
      };
    },
  };
}

function normalizeBaseUrl(value: string | undefined) {
  const candidate = value?.trim() || DEFAULT_GITLAB_BASE_URL;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error("GITLAB_BASE_URL must be an absolute HTTPS URL.");
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("GITLAB_BASE_URL must be an absolute HTTPS URL without credentials, query, or fragment.");
  }

  return url.toString().replace(/\/+$/, "");
}

function parseNextPage(value: string | null) {
  if (value === null || value.trim() === "") {
    return null;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    throw new Error("GitLab API returned an invalid X-Next-Page header.");
  }

  const page = Number(normalized);

  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("GitLab API returned an invalid X-Next-Page header.");
  }

  return page;
}

function gitlabResponseError(status: number) {
  if (status === 401 || status === 403) {
    return new Error(`GitLab API authentication or authorization failed (status ${status}).`);
  }

  if (status === 404) {
    return new Error("GitLab resource was not found or is inaccessible (status 404).");
  }

  return new Error(`GitLab API request failed with status ${status}.`);
}
