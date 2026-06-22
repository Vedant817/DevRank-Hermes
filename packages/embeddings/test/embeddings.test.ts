import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  embedTexts,
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

test("posts text batches to the embeddings endpoint", async () => {
  const vector = Array.from({ length: DEFAULT_EMBEDDING_DIMENSIONS }, (_, index) => index / 10);
  const calls: Array<{
    body: unknown;
    headers: HeadersInit | undefined;
    url: string;
  }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({
      body: JSON.parse(String(init?.body)),
      headers: init?.headers,
      url: String(url),
    });

    return Response.json({
      data: [
        { embedding: vector, index: 0 },
        { embedding: vector.map((value) => value + 1), index: 1 },
      ],
      model: DEFAULT_EMBEDDING_MODEL,
    });
  };

  const result = await embedTexts(
    ["first", "second"],
    {
      EMBEDDING_API_KEY: "key",
    },
    { fetch: fetchImpl },
  );

  assert.equal(calls[0]?.url, "https://openrouter.ai/api/v1/embeddings");
  assert.deepEqual((calls[0]?.body as { input: string[] }).input, ["first", "second"]);
  assert.equal(result.embeddings.length, 2);
  assert.equal(result.embeddings[0]?.length, DEFAULT_EMBEDDING_DIMENSIONS);
});

test("rejects embedding responses with the wrong vector size", async () => {
  const fetchImpl: typeof fetch = async () => Response.json({
    data: [{ embedding: [1, 2, 3], index: 0 }],
    model: DEFAULT_EMBEDDING_MODEL,
  });

  await assert.rejects(
    embedTexts(["bad"], { EMBEDDING_API_KEY: "key" }, { fetch: fetchImpl }),
    /exactly 1536 dimensions/,
  );
});
