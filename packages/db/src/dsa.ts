import { isValidDateOnly, type DsaDifficulty, type DsaQuestion } from "@repo/shared";
import type { SqlClient } from "./client.js";

type DsaQuestionSqlRow = {
  difficulty: string;
  patterns: string[] | null;
  slug: string;
  title: string;
  topic: string;
  url: string;
};

type DsaCompletionSqlRow = {
  created_at: Date | string;
  metadata_date: string | null;
  occurred_at: string | null;
  slug: string;
};

export type DsaCompletion = {
  date: string;
  slug: string;
};

const VALID_DIFFICULTIES = new Set<DsaDifficulty>(["easy", "hard", "medium"]);
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export async function listDsaQuestionBank(sql: SqlClient): Promise<DsaQuestion[]> {
  const rows = await sql<DsaQuestionSqlRow[]>`
    select slug, title, topic, difficulty, url, patterns
    from dsa_questions
    order by topic asc, difficulty asc, slug asc
  `;

  return rows.map(toDsaQuestion);
}

export async function listDsaCompletions(sql: SqlClient): Promise<DsaCompletion[]> {
  const rows = await sql<DsaCompletionSqlRow[]>`
    select
      memory_items.metadata->>'dsaSlug' as slug,
      memory_items.metadata->>'date' as metadata_date,
      memory_items.metadata->>'occurredAt' as occurred_at,
      memory_items.created_at
    from memory_items
    join dsa_questions on dsa_questions.slug = memory_items.metadata->>'dsaSlug'
    where nullif(memory_items.metadata->>'dsaSlug', '') is not null
    order by memory_items.created_at desc, slug asc
  `;

  const unique = new Map<string, DsaCompletion>();

  for (const row of rows) {
    const date = completionDate(row);

    if (date) {
      unique.set(`${row.slug}:${date}`, { date, slug: row.slug });
    }
  }

  return [...unique.values()];
}

export function toDsaQuestion(row: DsaQuestionSqlRow): DsaQuestion {
  return {
    slug: row.slug,
    title: row.title,
    topic: row.topic,
    difficulty: normalizeDifficulty(row.difficulty),
    url: row.url,
    patterns: row.patterns ?? [],
  };
}

function normalizeDifficulty(value: string): DsaDifficulty {
  const normalized = value.trim().toLowerCase();

  return VALID_DIFFICULTIES.has(normalized as DsaDifficulty)
    ? (normalized as DsaDifficulty)
    : "medium";
}

function completionDate(row: DsaCompletionSqlRow): string | undefined {
  if (row.metadata_date !== null) {
    return isValidDateOnly(row.metadata_date) ? row.metadata_date : undefined;
  }

  if (row.occurred_at !== null) {
    if (isValidDateOnly(row.occurred_at)) {
      return row.occurred_at;
    }

    if (!ISO_TIMESTAMP_PATTERN.test(row.occurred_at)) {
      return undefined;
    }

    const parsed = new Date(row.occurred_at);
    const date = row.occurred_at.slice(0, 10);
    return Number.isFinite(parsed.getTime()) && isValidDateOnly(date) ? date : undefined;
  }

  const parsed = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : undefined;
}
