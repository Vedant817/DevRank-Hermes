import { MastraVector } from "@mastra/core/vector";
import { QdrantClient } from "@qdrant/js-client-rest";
import type {
  CreateIndexParams,
  DeleteIndexParams,
  DeleteVectorParams,
  DeleteVectorsParams,
  DescribeIndexParams,
  IndexStats,
  QueryResult,
  QueryVectorParams,
  UpdateVectorParams,
  UpsertVectorParams,
} from "@mastra/core/vector";

export class QdrantMastraVector extends MastraVector {
  private client: QdrantClient;

  constructor({ url, apiKey }: { url: string; apiKey?: string }) {
    super({ id: "qdrant" });
    this.client = new QdrantClient({ url, apiKey });
  }

  async createIndex(params: CreateIndexParams): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === params.indexName,
    );
    if (!exists) {
      await this.client.createCollection(params.indexName, {
        vectors: {
          size: params.dimension,
          distance: this.toQdrantMetric(params.metric),
        },
      });
    }
  }

  async listIndexes(): Promise<string[]> {
    const collections = await this.client.getCollections();
    return collections.collections.map((c) => c.name);
  }

  async describeIndex(params: DescribeIndexParams): Promise<IndexStats> {
    const info = await this.client.getCollection(params.indexName);
    const vectorsConfig = info.config?.params?.vectors;
    const dimension =
      vectorsConfig && typeof vectorsConfig === "object" && "size" in vectorsConfig
        ? Number((vectorsConfig as Record<string, unknown>).size ?? 0)
        : 0;
    const metric =
      vectorsConfig && typeof vectorsConfig === "object" && "distance" in vectorsConfig
        ? this.fromQdrantMetric(String((vectorsConfig as Record<string, unknown>).distance ?? "Cosine"))
        : "cosine";
    const count = await this.client
      .count(params.indexName, { exact: true })
      .then((r) => r.count);

    return { dimension, count, metric };
  }

  async deleteIndex(params: DeleteIndexParams): Promise<void> {
    await this.client.deleteCollection(params.indexName);
  }

  async upsert(params: UpsertVectorParams): Promise<string[]> {
    const ids =
      params.ids ??
      params.vectors.map(() => crypto.randomUUID());
    const points = params.vectors.map((vector, i) => ({
      id: ids[i] ?? crypto.randomUUID(),
      vector,
      payload: params.metadata?.[i] ?? {},
    }));

    await this.client.upsert(params.indexName, {
      wait: true,
      points,
    });

    return ids;
  }

  async query(params: QueryVectorParams): Promise<QueryResult[]> {
    if (!params.queryVector) {
      return [];
    }

    const result = await this.client.search(params.indexName, {
      vector: params.queryVector,
      limit: params.topK ?? 10,
      with_payload: true,
      with_vector: params.includeVector ?? false,
    });

    return result.map((hit) => ({
      id: String(hit.id),
      score: hit.score ?? 0,
      metadata: (hit.payload ?? {}) as Record<string, unknown>,
      vector: params.includeVector
        ? (hit.vector as number[] | undefined)
        : undefined,
    }));
  }

  async updateVector(params: UpdateVectorParams): Promise<void> {
    const id = "id" in params ? params.id : undefined;
    if (id) {
      await this.client.setPayload(params.indexName, {
        payload: params.update.metadata ?? {},
        points: [id],
      });
      if (params.update.vector) {
        await this.client.updateVectors(params.indexName, {
          points: [{ id, vector: params.update.vector }],
        });
      }
    } else if ("filter" in params && params.filter) {
      const filter = params.filter as Record<string, unknown>;
      const searchResults = await this.client.search(params.indexName, {
        vector: Array(1536).fill(0),
        limit: 10000,
        with_payload: true,
      });
      const matchingIds = searchResults
        .filter((hit) => {
          const payload = hit.payload ?? {};
          return Object.entries(filter).every(
            ([key, value]) => (payload as Record<string, unknown>)[key] === value,
          );
        })
        .map((hit) => String(hit.id));

      if (matchingIds.length > 0) {
        await this.client.setPayload(params.indexName, {
          payload: params.update.metadata ?? {},
          points: matchingIds,
        });
        if (params.update.vector) {
          await this.client.updateVectors(params.indexName, {
            points: matchingIds.map((pointId) => ({
              id: pointId,
              vector: params.update.vector!,
            })),
          });
        }
      }
    }
  }

  async deleteVector(params: DeleteVectorParams): Promise<void> {
    await this.client.delete(params.indexName, {
      wait: true,
      points: [params.id],
    });
  }

  async deleteVectors(params: DeleteVectorsParams): Promise<void> {
    if (params.ids && params.ids.length > 0) {
      await this.client.delete(params.indexName, {
        wait: true,
        points: params.ids,
      });
    } else if (params.filter) {
      const filter = params.filter as Record<string, unknown>;
      const searchResults = await this.client.search(params.indexName, {
        vector: Array(1536).fill(0),
        limit: 10000,
        with_payload: true,
      });
      const matchingIds = searchResults
        .filter((hit) => {
          const payload = hit.payload ?? {};
          return Object.entries(filter).every(
            ([key, value]) => (payload as Record<string, unknown>)[key] === value,
          );
        })
        .map((hit) => String(hit.id));

      if (matchingIds.length > 0) {
        await this.client.delete(params.indexName, {
          wait: true,
          points: matchingIds,
        });
      }
    }
  }

  private toQdrantMetric(
    metric: "cosine" | "euclidean" | "dotproduct" | undefined,
  ): "Cosine" | "Euclid" | "Dot" {
    if (metric === "euclidean") return "Euclid";
    if (metric === "dotproduct") return "Dot";
    return "Cosine";
  }

  private fromQdrantMetric(metric: string): "cosine" | "euclidean" | "dotproduct" {
    if (metric === "Euclid") return "euclidean";
    if (metric === "Dot") return "dotproduct";
    return "cosine";
  }
}
