import {
  ConfigurationError,
  fetchWithPolicy,
  readRuntimeEnv,
  requireEnv,
  type RuntimeEnv,
} from "@repo/shared";
import { computeSkillGap, scoreSkillFrequency, skillTaxonomy } from "./skill-extraction.js";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface MarketBenchmark {
  generatedAt: string;
  queries: string[];
  repeatedSkills: string[];
  results: SearchResult[];
  skillFrequency: Record<string, number>;
  missingSkills: string[];
  resumeKeywordGaps: string[];
  weeklyLearningPriorities: string[];
}

export type MarketSearchProvider = "tavily";

const unsupportedMarketProviderKeys = ["EXA_API_KEY", "FIRECRAWL_API_KEY"] as const;

export function resolveMarketSearchProvider(env: RuntimeEnv): MarketSearchProvider {
  if (env.TAVILY_API_KEY) {
    return "tavily";
  }

  const configuredUnsupportedKeys = unsupportedMarketProviderKeys.filter((key) => env[key]);

  if (configuredUnsupportedKeys.length > 0) {
    throw new ConfigurationError(
      `Market benchmark search currently supports TAVILY_API_KEY only. Configured unsupported provider credentials: ${configuredUnsupportedKeys.join(", ")}.`,
    );
  }

  requireEnv(env, ["TAVILY_API_KEY"], "Market benchmark search");

  return "tavily";
}

async function tavilySearch(
  query: string,
  env: RuntimeEnv,
): Promise<SearchResult[]> {
  const { TAVILY_API_KEY } = requireEnv(env, ["TAVILY_API_KEY"], "Tavily search");

  const response = await fetchWithPolicy("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 5,
    }),
  }, {
    retry: true,
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with ${response.status}.`);
  }

  const json = await response.json() as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (json.results ?? []).map((result) => ({
    title: result.title ?? "Untitled",
    url: result.url ?? "",
    content: result.content ?? "",
  }));
}

export async function runMarketBenchmark(
  queries: string[],
  env: RuntimeEnv = readRuntimeEnv(),
  options: {
    ownedSkillSlugs?: string[];
  } = {},
): Promise<MarketBenchmark> {
  resolveMarketSearchProvider(env);

  const results = [];

  for (const query of queries) {
    results.push(...(await tavilySearch(query, env)));
  }

  const skillFrequency = scoreSkillFrequency(results);
  const gap = computeSkillGap(skillFrequency, options.ownedSkillSlugs ?? []);

  return {
    generatedAt: new Date().toISOString(),
    queries,
    repeatedSkills: repeatedSkillsFromFrequency(skillFrequency),
    results,
    skillFrequency,
    missingSkills: gap.missingSkills,
    resumeKeywordGaps: gap.resumeKeywordGaps,
    weeklyLearningPriorities: gap.weeklyLearningPriorities,
  };
}

function repeatedSkillsFromFrequency(skillFrequency: Record<string, number>): string[] {
  const bySlug = new Map(skillTaxonomy.map((entry) => [entry.slug, entry.name]));

  return Object.entries(skillFrequency)
    .filter(([, count]) => count >= 3)
    .map(([slug]) => bySlug.get(slug) ?? slug)
    .sort();
}
