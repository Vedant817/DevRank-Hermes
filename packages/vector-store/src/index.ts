import { QdrantClient } from "@qdrant/js-client-rest";
import {
  ConfigurationError,
  MEMORY_EMBEDDING_DIMENSIONS,
  readRuntimeEnv,
  type RuntimeEnv,
} from "@repo/shared";
export { QdrantMastraVector } from "./mastra-vector.js";

export const DEFAULT_QDRANT_URL = "http://localhost:6333";
export const DEFAULT_COLLECTION_NAME = "memory_embeddings";
export const VECTOR_DIMENSIONS = MEMORY_EMBEDDING_DIMENSIONS;

export interface VectorStoreConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  https?: boolean;
}

export interface VectorRecord {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export function resolveVectorStoreConfig(env: RuntimeEnv = readRuntimeEnv()): VectorStoreConfig {
  return {
    url: env.QDRANT_URL ?? DEFAULT_QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
    collectionName: env.QDRANT_COLLECTION_NAME ?? DEFAULT_COLLECTION_NAME,
    https: env.QDRANT_HTTPS === "true",
  };
}

function createQdrantClient(config: VectorStoreConfig): QdrantClient {
  return new QdrantClient({
    url: config.url,
    apiKey: config.apiKey,
    https: config.https,
  });
}

export class QdrantVectorStore {
  private client: QdrantClient;
  private collectionName: string;

  constructor(config: VectorStoreConfig) {
    this.client = createQdrantClient(config);
    this.collectionName = config.collectionName;
  }

  async ensureCollection(dimensions: number = VECTOR_DIMENSIONS): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === this.collectionName,
    );

    if (exists) {
      return;
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: dimensions,
        distance: "Cosine",
      },
    });
  }

  async deleteCollection(): Promise<void> {
    await this.client.deleteCollection(this.collectionName);
  }

  async upsert(points: VectorRecord[]): Promise<number> {
    if (points.length === 0) {
      return 0;
    }

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: points.map((point) => ({
        id: point.id,
        vector: point.vector,
        payload: point.payload,
      })),
    });

    return points.length;
  }

  async search(
    vector: number[],
    filter?: Record<string, unknown>,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    const result = await this.client.search(this.collectionName, {
      vector,
      limit,
      filter: filter as Record<string, unknown> | undefined,
      with_payload: true,
    });

    return result.map((hit) => ({
      id: String(hit.id),
      score: hit.score ?? 0,
      payload: (hit.payload ?? {}) as Record<string, unknown>,
    }));
  }

  async deleteByFilter(filter: Record<string, unknown>): Promise<void> {
    await this.client.delete(this.collectionName, {
      wait: true,
      filter: filter as Record<string, unknown>,
    });
  }

  async getPoint(id: string): Promise<VectorRecord | null> {
    const result = await this.client.retrieve(this.collectionName, {
      ids: [id],
      with_payload: true,
      with_vector: true,
    });

    const point = result[0];
    if (!point) {
      return null;
    }

    return {
      id: String(point.id),
      vector: point.vector as number[],
      payload: (point.payload ?? {}) as Record<string, unknown>,
    };
  }

  async count(): Promise<number> {
    const result = await this.client.count(this.collectionName, {
      exact: true,
    });

    return result.count;
  }
}

export function createVectorStore(
  env: RuntimeEnv = readRuntimeEnv(),
): QdrantVectorStore {
  const config = resolveVectorStoreConfig(env);

  if (!config.url || config.url.trim().length === 0) {
    throw new ConfigurationError(
      "Qdrant vector store is not configured. Set QDRANT_URL.",
    );
  }

  return new QdrantVectorStore(config);
}

export async function ensureVectorStore(
  dimensions: number = VECTOR_DIMENSIONS,
  env?: RuntimeEnv,
): Promise<QdrantVectorStore> {
  const store = createVectorStore(env);
  await store.ensureCollection(dimensions);
  return store;
}
