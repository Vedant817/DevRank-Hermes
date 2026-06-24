import {
  fetchWithPolicy,
  readRuntimeEnv,
  requireEnv,
  type RuntimeEnv,
} from "@repo/shared";
import type { ContextItem, ContextSearchInput, ContextWriteInput } from "./types.js";

const DEFAULT_CONTEXT_LIMIT = 10;
const MAX_CONTEXT_LIMIT = 25;

function baseHeaders(env: RuntimeEnv): HeadersInit {
  const { SUPERMEMORY_API_KEY } = requireEnv(
    env,
    ["SUPERMEMORY_API_KEY"],
    "Supermemory",
  );

  return {
    Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function searchSupermemoryContext(
  input: ContextSearchInput,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<ContextItem[]> {
  const url = new URL("https://api.supermemory.ai/v3/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("limit", String(clampLimit(input.limit)));

  for (const tag of input.containerTags ?? []) {
    url.searchParams.append("containerTags", tag);
  }

  const response = await fetchWithPolicy(url, {
    method: "GET",
    headers: baseHeaders(env),
  });

  if (!response.ok) {
    throw new Error(`Supermemory search failed with ${response.status}.`);
  }

  const json = await response.json() as {
    results?: Array<{
      id?: string;
      score?: number;
      memory?: { content?: string; title?: string };
      chunk?: { content?: string; documentId?: string };
    }>;
  };

  return (json.results ?? []).map((result, index) => ({
    id: result.id ?? result.chunk?.documentId ?? `supermemory-${index}`,
    title: result.memory?.title ?? "Supermemory result",
    summary: result.memory?.content ?? result.chunk?.content ?? "",
    source: "supermemory",
    score: result.score,
  }));
}

function clampLimit(limit: number | undefined) {
  return Math.max(1, Math.min(limit ?? DEFAULT_CONTEXT_LIMIT, MAX_CONTEXT_LIMIT));
}

export async function writeSupermemoryContext(
  input: ContextWriteInput,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<ContextItem> {
  const response = await fetchWithPolicy("https://api.supermemory.ai/v3/documents", {
    method: "POST",
    headers: baseHeaders(env),
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      containerTags: input.containerTags,
      metadata: input.metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supermemory write failed with ${response.status}.`);
  }

  const json = await response.json() as { id?: string; title?: string; summary?: string };

  return {
    id: json.id ?? input.sourceId ?? input.title,
    title: json.title ?? input.title,
    summary: json.summary ?? input.content,
    source: "supermemory",
    metadata: input.metadata,
  };
}
