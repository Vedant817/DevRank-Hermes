import { createHash } from "node:crypto";
import { readRuntimeEnv, type RuntimeEnv } from "@repo/shared";
import { searchQdrantContext, writeQdrantContext } from "./qdrant.js";
import { searchSupabaseContext, writeSupabaseContext } from "./supabase.js";
import { searchSupermemoryContext, writeSupermemoryContext } from "./supermemory.js";
import type { ContextItem, ContextSearchInput, ContextWriteInput } from "./types.js";

export interface ContextProviders {
  searchQdrantContext?: typeof searchQdrantContext;
  searchSupabaseContext?: typeof searchSupabaseContext;
  searchSupermemoryContext?: typeof searchSupermemoryContext;
  writeQdrantContext?: typeof writeQdrantContext;
  writeSupabaseContext?: typeof writeSupabaseContext;
  writeSupermemoryContext?: typeof writeSupermemoryContext;
}

const defaultProviders: ContextProviders = {
  searchQdrantContext,
  searchSupabaseContext,
  searchSupermemoryContext,
  writeQdrantContext,
  writeSupabaseContext,
  writeSupermemoryContext,
};

export async function searchContext(
  input: ContextSearchInput,
  env: RuntimeEnv = readRuntimeEnv(),
  providers: ContextProviders = defaultProviders,
): Promise<ContextItem[]> {
  if (env.CONTEXT_PROVIDER === "qdrant") {
    return (providers.searchQdrantContext ?? searchQdrantContext)(input, env);
  }

  if (env.CONTEXT_PROVIDER === "supermemory") {
    return (providers.searchSupermemoryContext ?? searchSupermemoryContext)(input, env);
  }

  if (env.CONTEXT_PROVIDER === "combined") {
    const [supabase, supermemory] = await Promise.all([
      (providers.searchSupabaseContext ?? searchSupabaseContext)(input),
      (providers.searchSupermemoryContext ?? searchSupermemoryContext)(input, env),
    ]);

    return [...supabase, ...supermemory].slice(0, input.limit ?? 10);
  }

  return (providers.searchSupabaseContext ?? searchSupabaseContext)(input);
}

export async function writeContext(
  input: ContextWriteInput,
  env: RuntimeEnv = readRuntimeEnv(),
  providers: ContextProviders = defaultProviders,
): Promise<ContextItem> {
  const normalizedInput = normalizeContextWriteInput(input);

  if (env.CONTEXT_PROVIDER === "qdrant") {
    return (providers.writeQdrantContext ?? writeQdrantContext)(normalizedInput);
  }

  if (env.CONTEXT_PROVIDER === "supermemory") {
    return (providers.writeSupermemoryContext ?? writeSupermemoryContext)(normalizedInput, env);
  }

  if (env.CONTEXT_PROVIDER === "combined") {
    try {
      const supermemory = await (providers.writeSupermemoryContext ?? writeSupermemoryContext)(normalizedInput, env);

      return (providers.writeSupabaseContext ?? writeSupabaseContext)(withSupermemoryStatus(normalizedInput, {
        id: supermemory.id,
        source: supermemory.source,
        status: "written",
      }));
    } catch (error) {
      await (providers.writeSupabaseContext ?? writeSupabaseContext)(withSupermemoryStatus(normalizedInput, {
        error: publicError(error),
        status: "failed",
      }));
      throw error;
    }
  }

  return (providers.writeSupabaseContext ?? writeSupabaseContext)(normalizedInput);
}

export function normalizeContextWriteInput(input: ContextWriteInput): ContextWriteInput {
  return {
    ...input,
    sourceId: input.sourceId ?? stableContextSourceId(input),
  };
}

function stableContextSourceId(input: ContextWriteInput) {
  return createHash("sha256")
    .update(JSON.stringify({
      content: input.content,
      source: input.source,
      title: input.title,
    }))
    .digest("hex")
    .slice(0, 32);
}

function withSupermemoryStatus(
  input: ContextWriteInput,
  supermemory: Record<string, string>,
): ContextWriteInput {
  return {
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      externalContext: {
        ...externalContextMetadata(input.metadata),
        supermemory,
      },
    },
  };
}

function externalContextMetadata(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.externalContext;

  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function publicError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);

  return raw
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s)]+/gi, "$1=[REDACTED_SECRET]")
    .slice(0, 160);
}

export * from "./qdrant.js";
export * from "./supermemory.js";
export * from "./supabase.js";
export * from "./types.js";
