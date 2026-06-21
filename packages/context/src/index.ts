import { readRuntimeEnv, type RuntimeEnv } from "@repo/shared";
import { searchSupabaseContext, writeSupabaseContext } from "./supabase.js";
import { searchSupermemoryContext, writeSupermemoryContext } from "./supermemory.js";
import type { ContextItem, ContextSearchInput, ContextWriteInput } from "./types.js";

export async function searchContext(
  input: ContextSearchInput,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<ContextItem[]> {
  if (env.CONTEXT_PROVIDER === "supermemory") {
    return searchSupermemoryContext(input, env);
  }

  if (env.CONTEXT_PROVIDER === "combined") {
    const [supabase, supermemory] = await Promise.all([
      searchSupabaseContext(input),
      searchSupermemoryContext(input, env),
    ]);

    return [...supabase, ...supermemory].slice(0, input.limit ?? 10);
  }

  return searchSupabaseContext(input);
}

export async function writeContext(
  input: ContextWriteInput,
  env: RuntimeEnv = readRuntimeEnv(),
): Promise<ContextItem> {
  if (env.CONTEXT_PROVIDER === "supermemory") {
    return writeSupermemoryContext(input, env);
  }

  if (env.CONTEXT_PROVIDER === "combined") {
    const supabase = await writeSupabaseContext(input);
    await writeSupermemoryContext(input, env);
    return supabase;
  }

  return writeSupabaseContext(input);
}

export * from "./supermemory.js";
export * from "./supabase.js";
export * from "./types.js";
