import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeContextWriteInput,
  searchContext,
  writeContext,
  type ContextProviders,
} from "../src/index.js";

test("normalizes context writes with a stable source id", () => {
  const input = {
    content: "Built context retry handling.",
    source: "unit-test",
    title: "Context retry",
  };

  assert.equal(
    normalizeContextWriteInput(input).sourceId,
    normalizeContextWriteInput(input).sourceId,
  );
  assert.equal(
    normalizeContextWriteInput({ ...input, sourceId: "explicit-id" }).sourceId,
    "explicit-id",
  );
});

test("combined context search returns the healthy provider and removes duplicate content", async () => {
  const searchScopes: Array<string[] | undefined> = [];
  const providers = fakeProviders({
    searchSupabase: async (input) => {
      searchScopes.push(input.containerTags);

      return [{
        id: "supabase-1",
        score: 0.7,
        source: "supabase",
        summary: "Shared context",
        title: "Context",
      }];
    },
    searchSupermemory: async () => [{
      id: "supermemory-1",
      score: 0.9,
      source: "supermemory",
      summary: "Shared context",
      title: "Context",
    }],
    writeSupabase: async () => {
      throw new Error("unused");
    },
    writeSupermemory: async () => {
      throw new Error("unused");
    },
  });

  const deduplicated = await searchContext(
    { query: "context" },
    { CONTEXT_PROVIDER: "combined", DEVRANK_OWNER_ID: "vedant" },
    providers,
  );
  providers.searchSupermemoryContext = async () => {
    throw new Error("Supermemory unavailable");
  };
  const fallback = await searchContext(
    { query: "context" },
    { CONTEXT_PROVIDER: "combined", DEVRANK_OWNER_ID: "vedant" },
    providers,
  );

  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0]?.source, "supermemory");
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0]?.source, "supabase");
  assert.deepEqual(searchScopes, [["user:vedant"], ["user:vedant"]]);
});

test("context access rejects a different user scope", async () => {
  const providers = fakeProviders({
    writeSupabase: async () => {
      throw new Error("unused");
    },
    writeSupermemory: async () => {
      throw new Error("unused");
    },
  });

  await assert.rejects(
    searchContext(
      {
        containerTags: ["user:other"],
        query: "context",
      },
      {
        CONTEXT_PROVIDER: "supabase",
        DEVRANK_OWNER_ID: "vedant",
      },
      providers,
    ),
    /does not match the configured single-user owner/,
  );
});

test("combined context search fails when every provider fails", async () => {
  const providers = fakeProviders({
    searchSupabase: async () => {
      throw new Error("Supabase unavailable");
    },
    searchSupermemory: async () => {
      throw new Error("Supermemory unavailable");
    },
    writeSupabase: async () => {
      throw new Error("unused");
    },
    writeSupermemory: async () => {
      throw new Error("unused");
    },
  });

  await assert.rejects(
    searchContext(
      { query: "context" },
      { CONTEXT_PROVIDER: "combined", DEVRANK_OWNER_ID: "vedant" },
      providers,
    ),
    /All configured context providers failed/,
  );
});

test("combined context writes record Supermemory success in Supabase metadata", async () => {
  const writes: unknown[] = [];
  const providers = fakeProviders({
    writeSupabase: async (input) => {
      writes.push(input);

      return {
        id: "supabase-1",
        metadata: input.metadata,
        source: input.source,
        summary: input.content,
        title: input.title,
      };
    },
    writeSupermemory: async () => ({
      id: "supermemory-1",
      source: "supermemory",
      summary: "Stored externally.",
      title: "External context",
    }),
  });

  await writeContext(
    {
      content: "Built context retry handling.",
      source: "unit-test",
      title: "Context retry",
    },
    {
      CONTEXT_PROVIDER: "combined",
      DEVRANK_OWNER_ID: "vedant",
      SUPERMEMORY_API_KEY: "test-key",
    },
    providers,
  );

  const supabaseInput = writes[0] as {
    containerTags?: string[];
    metadata?: { externalContext?: { supermemory?: { id?: string; status?: string } } };
    sourceId?: string;
  };

  assert.equal(typeof supabaseInput.sourceId, "string");
  assert.deepEqual(supabaseInput.containerTags, ["user:vedant"]);
  assert.equal(supabaseInput.metadata?.externalContext?.supermemory?.status, "written");
  assert.equal(supabaseInput.metadata?.externalContext?.supermemory?.id, "supermemory-1");
});

test("combined context writes record Supermemory failure status before rethrowing", async () => {
  const writes: unknown[] = [];
  const providers = fakeProviders({
    writeSupabase: async (input) => {
      writes.push(input);

      return {
        id: "supabase-1",
        metadata: input.metadata,
        source: input.source,
        summary: input.content,
        title: input.title,
      };
    },
    writeSupermemory: async () => {
      throw new Error("token=secret-value failed");
    },
  });

  await assert.rejects(
    writeContext(
      {
        content: "Built context retry handling.",
        source: "unit-test",
        title: "Context retry",
      },
      {
        CONTEXT_PROVIDER: "combined",
        DEVRANK_OWNER_ID: "vedant",
        SUPERMEMORY_API_KEY: "test-key",
      },
      providers,
    ),
    /secret-value failed/,
  );

  const supabaseInput = writes[0] as {
    metadata?: { externalContext?: { supermemory?: { error?: string; status?: string } } };
    sourceId?: string;
  };

  assert.equal(typeof supabaseInput.sourceId, "string");
  assert.equal(supabaseInput.metadata?.externalContext?.supermemory?.status, "failed");
  assert.equal(supabaseInput.metadata?.externalContext?.supermemory?.error, "token=[REDACTED_SECRET] failed");
});

test("combined context retries reuse the same remote identity after a Supabase failure", async () => {
  const remoteWrites: Array<{ sourceId?: string }> = [];
  let supabaseAttempts = 0;
  const providers = fakeProviders({
    writeSupabase: async (input) => {
      supabaseAttempts += 1;

      if (supabaseAttempts === 1) {
        throw new Error("Supabase unavailable");
      }

      return {
        id: "supabase-1",
        metadata: input.metadata,
        source: input.source,
        summary: input.content,
        title: input.title,
      };
    },
    writeSupermemory: async (input) => {
      remoteWrites.push({ sourceId: input.sourceId });

      return {
        id: "supermemory-1",
        source: "supermemory",
        summary: input.content,
        title: input.title,
      };
    },
  });
  const input = {
    content: "Built idempotent context retries.",
    source: "unit-test",
    title: "Context retry",
  };
  const env = {
    CONTEXT_PROVIDER: "combined",
    DEVRANK_OWNER_ID: "vedant",
    SUPERMEMORY_API_KEY: "test-key",
  };

  await assert.rejects(writeContext(input, env, providers), /Supabase unavailable/);
  await writeContext(input, env, providers);

  assert.equal(remoteWrites.length, 2);
  assert.equal(typeof remoteWrites[0]?.sourceId, "string");
  assert.equal(remoteWrites[1]?.sourceId, remoteWrites[0]?.sourceId);
});

function fakeProviders(input: {
  searchSupabase?: ContextProviders["searchSupabaseContext"];
  searchSupermemory?: ContextProviders["searchSupermemoryContext"];
  writeSupabase: ContextProviders["writeSupabaseContext"];
  writeSupermemory: ContextProviders["writeSupermemoryContext"];
}): ContextProviders {
  return {
    searchSupabaseContext: input.searchSupabase ?? (async () => []),
    searchSupermemoryContext: input.searchSupermemory ?? (async () => []),
    writeSupabaseContext: input.writeSupabase,
    writeSupermemoryContext: input.writeSupermemory,
  };
}
