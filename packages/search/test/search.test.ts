import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationError } from "@repo/shared";
import { resolveMarketSearchProvider } from "../src/index.js";

test("resolves Tavily as the supported market search provider", () => {
  assert.equal(resolveMarketSearchProvider({ TAVILY_API_KEY: "tavily-key" }), "tavily");
});

test("fails clearly when only unsupported market search providers are configured", () => {
  assert.throws(
    () => resolveMarketSearchProvider({
      EXA_API_KEY: "exa-key",
      FIRECRAWL_API_KEY: "firecrawl-key",
    }),
    (error) => error instanceof ConfigurationError
      && error.message.includes("supports TAVILY_API_KEY only")
      && error.message.includes("EXA_API_KEY, FIRECRAWL_API_KEY"),
  );
});

test("requires Tavily when no market search provider is configured", () => {
  assert.throws(
    () => resolveMarketSearchProvider({}),
    /Market benchmark search is not configured\. Missing: TAVILY_API_KEY/,
  );
});
