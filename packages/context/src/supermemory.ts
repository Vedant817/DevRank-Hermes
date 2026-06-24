import { createHash } from "node:crypto";
import {
  fetchWithPolicy,
  readRuntimeEnv,
  requireEnv,
  type RuntimeEnv,
} from "@repo/shared";
import type { ContextItem, ContextSearchInput, ContextWriteInput } from "./types.js";

const DEFAULT_CONTEXT_LIMIT = 10;
const MAX_CONTEXT_LIMIT = 25;

export interface SupermemoryRequestOptions {
  fetch?: typeof fetch;
}

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
  const tags = [...new Set(input.containerTags ?? [])];
  const scopedResults = tags.length > 0
    ? await Promise.all(tags.map((containerTag) =>
        searchSupermemoryScope(input, env, containerTag)))
    : [await searchSupermemoryScope(input, env)];

  if (scopedResults.length === 1) {
    return scopedResults[0] ?? [];
  }

  const requiredScopes = scopedResults.length;
  const matches = new Map<string, { count: number; item: ContextItem }>();

  for (const results of scopedResults) {
    for (const item of results) {
      const existing = matches.get(item.id);
      matches.set(item.id, {
        count: (existing?.count ?? 0) + 1,
        item: existing && (existing.item.score ?? 0) >= (item.score ?? 0)
          ? existing.item
          : item,
      });
    }
  }

  return [...matches.values()]
    .filter((match) => match.count === requiredScopes)
    .map((match) => match.item)
    .sort(compareContextScore)
    .slice(0, clampLimit(input.limit));
}

async function searchSupermemoryScope(
  input: ContextSearchInput,
  env: RuntimeEnv,
  containerTag?: string,
) {
  const response = await fetchWithPolicy("https://api.supermemory.ai/v4/search", {
    method: "POST",
    headers: baseHeaders(env),
    body: JSON.stringify({
      q: input.query,
      limit: clampLimit(input.limit),
      searchMode: "hybrid",
      ...(containerTag ? { containerTag } : {}),
    }),
  }, {
    retry: true,
  });

  if (!response.ok) {
    throw new Error(`Supermemory search failed with ${response.status}.`);
  }

  const json = await response.json() as {
    results?: Array<{
      id?: string;
      similarity?: number;
      memory?: string;
      chunk?: string;
      documents?: Array<{ id?: string; summary?: string | null; title?: string | null }>;
    }>;
  };

  return (json.results ?? []).map((result, index) => ({
    id: result.id ?? result.documents?.[0]?.id ?? `supermemory-${index}`,
    title: result.documents?.[0]?.title ?? "Supermemory result",
    summary: result.memory
      ?? result.documents?.[0]?.summary
      ?? result.chunk
      ?? "",
    source: "supermemory",
    score: result.similarity,
  }));
}

function clampLimit(limit: number | undefined) {
  return Math.max(1, Math.min(limit ?? DEFAULT_CONTEXT_LIMIT, MAX_CONTEXT_LIMIT));
}

function compareContextScore(left: ContextItem, right: ContextItem) {
  return (right.score ?? 0) - (left.score ?? 0);
}

export async function writeSupermemoryContext(
  input: ContextWriteInput,
  env: RuntimeEnv = readRuntimeEnv(),
  options: SupermemoryRequestOptions = {},
): Promise<ContextItem> {
  const response = await fetchWithPolicy("https://api.supermemory.ai/v3/documents", {
    method: "POST",
    headers: baseHeaders(env),
    body: JSON.stringify({
      content: input.content,
      customId: supermemoryCustomId(input),
      ...supermemoryContainer(input.containerTags),
      metadata: supermemoryMetadata(input),
    }),
  }, {
    fetch: options.fetch,
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

export function supermemoryCustomId(input: ContextWriteInput) {
  const identity = `${input.source}:${input.sourceId ?? input.title}`;

  return `devrank-${createHash("sha256").update(identity).digest("hex").slice(0, 48)}`;
}

function supermemoryContainer(containerTags: string[] | undefined) {
  if (!containerTags || containerTags.length === 0) {
    return {};
  }

  return containerTags.length === 1
    ? { containerTag: containerTags[0] }
    : { containerTags };
}

function supermemoryMetadata(input: ContextWriteInput) {
  const metadata: Record<string, string | number | boolean> = {
    source: input.source,
    sourceId: input.sourceId ?? "",
    title: input.title,
  };

  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (
      typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean"
    ) {
      metadata[key] = value;
    }
  }

  return metadata;
}
