import { closeSqlClient, createSqlClient } from "@repo/db";
import type { ContextItem, ContextSearchInput, ContextWriteInput } from "./types.js";

const DEFAULT_CONTEXT_LIMIT = 10;
const MAX_CONTEXT_LIMIT = 25;
const MAX_CONTEXT_SCAN_LIMIT = 100;
const MIN_CONTEXT_QUERY_LENGTH = 2;

export async function searchSupabaseContext(
  input: ContextSearchInput,
): Promise<ContextItem[]> {
  const sql = createSqlClient();
  const query = input.query.trim();
  const limit = clampLimit(input.limit);

  if (query.length < MIN_CONTEXT_QUERY_LENGTH) {
    throw new Error("Supabase context search requires at least two characters.");
  }

  const pattern = `%${escapeLikePattern(query)}%`;

  try {
    const rows = await sql<ContextItem[]>`
      select
        id::text,
        title,
        summary,
        source,
        metadata
      from memory_items
      where title ilike ${pattern} escape '!'
        or summary ilike ${pattern} escape '!'
      order by created_at desc
      limit ${Math.min(limit * 5, MAX_CONTEXT_SCAN_LIMIT)}
    `;

    return filterByContainerTags(rows, input.containerTags).slice(0, limit);
  } finally {
    await closeSqlClient(sql);
  }
}

export async function writeSupabaseContext(
  input: ContextWriteInput,
): Promise<ContextItem> {
  const sql = createSqlClient();
  const metadataJson = JSON.stringify({
    ...(input.metadata ?? {}),
    ...(input.containerTags ? { containerTags: input.containerTags } : {}),
  });

  try {
    if (input.sourceId) {
      const existing = await sql<Array<{ id: string }>>`
        select id::text
        from memory_items
        where source = ${input.source}
          and source_id = ${input.sourceId}
        order by created_at desc
        limit 1
      `;
      const existingId = existing[0]?.id;

      if (existingId) {
        const updated = await sql<ContextItem[]>`
          update memory_items
          set
            title = ${input.title},
            summary = ${input.content},
            metadata = ${metadataJson}::jsonb
          where id = ${existingId}
          returning id::text, title, summary, source, metadata
        `;
        const item = updated[0];

        if (!item) {
          throw new Error("Supabase context update returned no row.");
        }

        return item;
      }
    }

    const rows = await sql<ContextItem[]>`
      insert into memory_items (source, source_id, title, summary, metadata)
      values (
        ${input.source},
        ${input.sourceId ?? null},
        ${input.title},
        ${input.content},
        ${metadataJson}::jsonb
      )
      returning id::text, title, summary, source, metadata
    `;

    const item = rows[0];
    if (!item) {
      throw new Error("Supabase context write returned no row.");
    }

    return item;
  } finally {
    await closeSqlClient(sql);
  }
}

function clampLimit(limit: number | undefined) {
  return Math.max(1, Math.min(limit ?? DEFAULT_CONTEXT_LIMIT, MAX_CONTEXT_LIMIT));
}

function escapeLikePattern(value: string) {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}

function filterByContainerTags(
  rows: ContextItem[],
  containerTags: string[] | undefined,
) {
  if (containerTags === undefined || containerTags.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    const tags = row.metadata?.containerTags;

    return Array.isArray(tags)
      && containerTags.every((tag) => tags.includes(tag));
  });
}
