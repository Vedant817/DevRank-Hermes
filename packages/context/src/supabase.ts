import { closeSqlClient, createSqlClient } from "@repo/db";
import type { ContextItem, ContextSearchInput, ContextWriteInput } from "./types.js";

export async function searchSupabaseContext(
  input: ContextSearchInput,
): Promise<ContextItem[]> {
  const sql = createSqlClient();

  try {
    const rows = await sql<ContextItem[]>`
      select
        id::text,
        title,
        summary,
        source,
        metadata
      from memory_items
      where title ilike ${`%${input.query}%`}
        or summary ilike ${`%${input.query}%`}
      order by created_at desc
      limit ${input.limit ?? 10}
    `;

    return rows;
  } finally {
    await closeSqlClient(sql);
  }
}

export async function writeSupabaseContext(
  input: ContextWriteInput,
): Promise<ContextItem> {
  const sql = createSqlClient();
  const metadataJson = JSON.stringify(input.metadata ?? {});

  try {
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
