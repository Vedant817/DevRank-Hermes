import { Mastra } from "@mastra/core";
import { QdrantMastraVector } from "@repo/vector-store";
import {
  MEMORY_EMBEDDING_DIMENSIONS,
  readRuntimeEnv,
  type RuntimeEnv,
} from "@repo/shared";

export interface MastraRuntimeConfig {
  qdrantUrl: string;
  qdrantApiKey?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel: string;
  httpReferer: string;
  title: string;
}

export function resolveMastraConfig(env: RuntimeEnv = readRuntimeEnv()): MastraRuntimeConfig {
  return {
    qdrantUrl: env.QDRANT_URL ?? "http://localhost:6333",
    qdrantApiKey: env.QDRANT_API_KEY,
    baseUrl: env.AI_BASE_URL ?? env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKey: env.AI_API_KEY ?? env.OPENROUTER_API_KEY ?? "",
    model: env.AI_MODEL ?? env.HERMES_MODEL ?? "openrouter/auto",
    embeddingModel: env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
    httpReferer: env.AI_HTTP_REFERER ?? env.HERMES_HTTP_REFERER ?? "https://devrank-os.local",
    title: env.AI_TITLE ?? env.HERMES_TITLE ?? "DevRank OS",
  };
}

let mastraInstance: Mastra | null = null;

export function getMastraInstance(): Mastra {
  if (mastraInstance) {
    return mastraInstance;
  }

  const config = resolveMastraConfig();
  const vectorStore = new QdrantMastraVector({
    url: config.qdrantUrl,
    apiKey: config.qdrantApiKey,
  });

  mastraInstance = new Mastra({
    vectors: { qdrant: vectorStore },
  });

  return mastraInstance;
}

export function getVectorStore(): QdrantMastraVector {
  const mastra = getMastraInstance();
  const vectors = mastra.getVectors();
  const store = vectors?.qdrant;
  if (!store) {
    throw new Error("Qdrant vector store is not configured.");
  }
  return store as unknown as QdrantMastraVector;
}

export class MastraClient {
  private config: MastraRuntimeConfig;
  private fetchFn: typeof fetch;

  constructor(env?: RuntimeEnv, fetchFn?: typeof fetch) {
    this.config = resolveMastraConfig(env);
    this.fetchFn = fetchFn ?? fetch;
  }

  getModel(): string {
    return this.config.model;
  }

  async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    options?: { system?: string; model?: string },
  ): Promise<string> {
    const model = options?.model ?? this.config.model;
    const systemMessage = options?.system
      ? [{ role: "system", content: options.system }]
      : [];

    const response = await this.fetchFn(
      `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.config.httpReferer,
          "X-Title": this.config.title,
        },
        body: JSON.stringify({
          model,
          messages: [...systemMessage, ...messages],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `AI request failed with ${response.status}${errorText ? `: ${errorText.slice(0, 240)}` : ""}.`,
      );
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI response did not include content.");
    }

    return content;
  }

  async embedTexts(texts: string[], options?: { model?: string }): Promise<{
    embeddings: number[][];
    model: string;
    dimensions: number;
  }> {
    const normalizedTexts = texts.map((t) => t.trim()).filter(Boolean);
    if (normalizedTexts.length === 0) {
      throw new Error("At least one non-empty text is required.");
    }

    const model = options?.model ?? this.config.embeddingModel;

    const response = await this.fetchFn(
      `${this.config.baseUrl.replace(/\/+$/, "")}/embeddings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: normalizedTexts.length === 1 ? normalizedTexts[0] : normalizedTexts,
          dimensions: MEMORY_EMBEDDING_DIMENSIONS,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Embedding request failed with ${response.status}${errorText ? `: ${errorText.slice(0, 240)}` : ""}.`,
      );
    }

    const json = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
      model?: string;
    };

    const data = json.data;
    if (!Array.isArray(data) || data.length !== normalizedTexts.length) {
      throw new Error("Embedding response did not include one vector per input text.");
    }

    const embeddings = data
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => {
        if (!Array.isArray(item.embedding)) {
          throw new Error("Invalid embedding vector.");
        }
        return item.embedding;
      });

    return {
      embeddings,
      model: json.model ?? model,
      dimensions: MEMORY_EMBEDDING_DIMENSIONS,
    };
  }
}
