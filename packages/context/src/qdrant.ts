import { MastraClient, getVectorStore } from "@repo/mastra";
import { MEMORY_EMBEDDING_DIMENSIONS, readRuntimeEnv, type RuntimeEnv } from "@repo/shared";
import type { ContextItem, ContextSearchInput, ContextWriteInput } from "./types.js";

const DEFAULT_CONTEXT_LIMIT = 10;
const MAX_CONTEXT_LIMIT = 25;
const COLLECTION_NAME = "memory_embeddings";

export async function searchQdrantContext(
  input: ContextSearchInput,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<ContextItem[]> {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_CONTEXT_LIMIT, MAX_CONTEXT_LIMIT));
  const query = input.query.trim();

  if (query.length < 2) {
    throw new Error("Qdrant context search requires at least two characters.");
  }

  const client = new MastraClient(env);
  const embeddingResult = await client.embedTexts([query]);
  const queryVector = embeddingResult.embeddings[0];

  if (!queryVector) {
    return [];
  }

  const store = getVectorStore();
  await store.createIndex({
    indexName: COLLECTION_NAME,
    dimension: MEMORY_EMBEDDING_DIMENSIONS,
    metric: "cosine",
  });

  const results = await store.query({
    indexName: COLLECTION_NAME,
    queryVector,
    topK: limit,
  });

  return results.map((result) => ({
    id: result.id,
    title: (result.metadata?.title as string) ?? "Qdrant result",
    summary: (result.metadata?.summary as string) ?? "",
    source: (result.metadata?.source as string) ?? "qdrant",
    score: result.score,
    metadata: result.metadata,
  }));
}

export async function writeQdrantContext(
  input: ContextWriteInput,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<ContextItem> {
  const store = getVectorStore();
  const collectionName = COLLECTION_NAME;
  const dimension = MEMORY_EMBEDDING_DIMENSIONS;

  await store.createIndex({
    indexName: collectionName,
    dimension,
    metric: "cosine",
  });

  const pointId = `${input.source}:${input.sourceId ?? input.title}`;
  const client = new MastraClient(env);
  const embeddingResult = await client.embedTexts(
    [`${input.title}\n\n${input.content}`],
  );

  await store.upsert({
    indexName: collectionName,
    vectors: embeddingResult.embeddings,
    ids: [pointId],
    metadata: [
      {
        title: input.title,
        summary: input.content,
        source: input.source,
        source_id: input.sourceId ?? null,
        ...(input.metadata ?? {}),
        ...(input.containerTags ? { containerTags: input.containerTags } : {}),
      },
    ],
  });

  return {
    id: pointId,
    title: input.title,
    summary: input.content,
    source: input.source,
    metadata: input.metadata,
  };
}
