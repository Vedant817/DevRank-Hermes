import {
  ConfigurationError,
  MEMORY_EMBEDDING_DIMENSIONS,
  readRuntimeEnv,
  type RuntimeEnv,
} from "@repo/shared";

export const DEFAULT_EMBEDDING_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_EMBEDDING_DIMENSIONS = MEMORY_EMBEDDING_DIMENSIONS;
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const DEFAULT_HTTP_REFERER = "https://devrank-os.local";
const DEFAULT_TITLE = "DevRank OS";

export interface EmbeddingRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  dimensions: number;
  httpReferer: string;
  model: string;
  title: string;
}

export interface EmbeddingRequestOptions {
  fetch?: typeof fetch;
}

export interface EmbeddingResult {
  dimensions: number;
  embeddings: number[][];
  model: string;
}

type EmbeddingResponse = {
  data?: Array<{
    embedding?: unknown;
    index?: number;
  }>;
  model?: string;
};

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
    httpReferer: env.HERMES_HTTP_REFERER ?? DEFAULT_HTTP_REFERER,
    model: env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    title: env.HERMES_TITLE ?? DEFAULT_TITLE,
  };
}

export async function embedTexts(
  texts: string[],
  env: RuntimeEnv = readRuntimeEnv(),
  options: EmbeddingRequestOptions = {},
): Promise<EmbeddingResult> {
  const normalizedTexts = texts.map((text) => text.trim()).filter(Boolean);

  if (normalizedTexts.length === 0) {
    throw new Error("Embedding generation requires at least one non-empty text.");
  }

  const config = resolveEmbeddingRuntimeConfig(env);
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.httpReferer,
      "X-Title": config.title,
    },
    body: JSON.stringify({
      dimensions: config.dimensions,
      input: normalizedTexts.length === 1 ? normalizedTexts[0] : normalizedTexts,
      model: config.model,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const detail = errorText.length > 0 ? `: ${errorText.slice(0, 240)}` : "";

    throw new Error(`Embedding request failed with ${response.status}${detail}.`);
  }

  const json = await response.json() as EmbeddingResponse;
  const data = json.data;

  if (!Array.isArray(data) || data.length !== normalizedTexts.length) {
    throw new Error("Embedding response did not include one vector per input text.");
  }

  const embeddings = data
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => normalizeEmbedding(item.embedding, config.dimensions));

  return {
    dimensions: config.dimensions,
    embeddings,
    model: json.model ?? config.model,
  };
}

function normalizeEmbedding(value: unknown, dimensions: number) {
  if (!Array.isArray(value) || value.length !== dimensions) {
    throw new Error(`Embedding vector must contain exactly ${dimensions} dimensions.`);
  }

  return value.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error("Embedding vector contains a non-finite value.");
    }

    return entry;
  });
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
