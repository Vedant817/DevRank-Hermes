import { ConfigurationError, readRuntimeEnv, requireEnv, type RuntimeEnv } from "@repo/shared";

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

  const response = await fetch("https://api.tavily.com/search", {
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
): Promise<MarketBenchmark> {
  resolveMarketSearchProvider(env);

  const results = [];

  for (const query of queries) {
    results.push(...(await tavilySearch(query, env)));
  }

  const text = results.map((result) => result.content.toLowerCase()).join(" ");
  const candidates = [
    "spring boot",
    "node.js",
    "postgres",
    "system design",
    "aws",
    "kubernetes",
    "kafka",
    "ci/cd",
    "testing",
    "ai agents",
  ];

  return {
    generatedAt: new Date().toISOString(),
    queries,
    repeatedSkills: candidates.filter((skill) => text.includes(skill)),
    results,
  };
}
