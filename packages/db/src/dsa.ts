import type { DsaDifficulty, DsaQuestion } from "@repo/shared";
import type { SqlClient } from "./client.js";

type DsaQuestionSqlRow = {
  difficulty: string;
  patterns: string[] | null;
  slug: string;
  title: string;
  topic: string;
  url: string;
};

const VALID_DIFFICULTIES = new Set<DsaDifficulty>(["easy", "hard", "medium"]);

export async function listDsaQuestionBank(sql: SqlClient): Promise<DsaQuestion[]> {
  const rows = await sql<DsaQuestionSqlRow[]>`
    select slug, title, topic, difficulty, url, patterns
    from dsa_questions
    order by topic asc, difficulty asc, slug asc
  `;

  return rows.map(toDsaQuestion);
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
