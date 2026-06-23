import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  resolveEmbeddingRuntimeConfig,
} from "../src/index.js";

test("resolves OpenRouter-compatible embedding config", () => {
  const config = resolveEmbeddingRuntimeConfig({
    EMBEDDING_API_KEY: "embedding-key",
  });

  assert.equal(config.apiKey, "embedding-key");
  assert.equal(config.dimensions, DEFAULT_EMBEDDING_DIMENSIONS);
  assert.equal(config.model, DEFAULT_EMBEDDING_MODEL);
});

test("uses OPENROUTER_API_KEY when embedding key is not separate", () => {
  const config = resolveEmbeddingRuntimeConfig({
    OPENROUTER_API_KEY: "openrouter-key",
  });

  assert.equal(config.apiKey, "openrouter-key");
});

test("rejects embedding dimensions that do not match the pgvector schema", () => {
  assert.throws(
    () => resolveEmbeddingRuntimeConfig({
      EMBEDDING_API_KEY: "embedding-key",
      EMBEDDING_DIMENSIONS: "768",
    }),
    /memory_embeddings\.embedding is stored as vector\(1536\)/,
  );
});
