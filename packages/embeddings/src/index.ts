import {
  ConfigurationError,
  MEMORY_EMBEDDING_DIMENSIONS,
  readRuntimeEnv,
  type RuntimeEnv,
} from "@repo/shared";
import { MastraClient } from "@repo/mastra";

export const DEFAULT_EMBEDDING_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_EMBEDDING_DIMENSIONS = MEMORY_EMBEDDING_DIMENSIONS;
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export interface EmbeddingRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  dimensions: number;
  httpReferer: string;
  model: string;
  title: string;
}

export interface EmbeddingResult {
  dimensions: number;
  embeddings: number[][];
  model: string;
}

export function resolveEmbeddingRuntimeConfig(env: RuntimeEnv = readRuntimeEnv()): EmbeddingRuntimeConfig {
  const apiKey = env.EMBEDDING_API_KEY ?? env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new ConfigurationError(
      "Embeddings are not configured. Set EMBEDDING_API_KEY or OPENROUTER_API_KEY.",
    );
  }

  return {
    apiKey,
    baseUrl: env.EMBEDDING_BASE_URL ?? env.OPENROUTER_BASE_URL ?? DEFAULT_EMBEDDING_BASE_URL,
    dimensions: parseDimensions(env.EMBEDDING_DIMENSIONS),
    httpReferer: env.HERMES_HTTP_REFERER ?? "https://devrank-os.local",
    model: env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    title: env.HERMES_TITLE ?? "DevRank OS",
  };
}

export async function embedTexts(
  texts: string[],
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<EmbeddingResult> {
  const client = new MastraClient(env);
  const result = await client.embedTexts(texts);

  return {
    dimensions: result.dimensions,
    embeddings: result.embeddings,
    model: result.model,
  };
}

function parseDimensions(value: string | undefined) {
  if (!value) {
    return DEFAULT_EMBEDDING_DIMENSIONS;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigurationError("EMBEDDING_DIMENSIONS must be a positive integer.");
  }

  if (parsed !== MEMORY_EMBEDDING_DIMENSIONS) {
    throw new ConfigurationError(
      `EMBEDDING_DIMENSIONS must be ${MEMORY_EMBEDDING_DIMENSIONS} because memory_embeddings.embedding is stored as vector(${MEMORY_EMBEDDING_DIMENSIONS}). Update the database schema before using another dimension.`,
    );
  }

  return parsed;
}
