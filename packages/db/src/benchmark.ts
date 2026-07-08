import type { SqlClient } from "./client.js";

export interface BenchmarkSnapshotRow {
  generatedAt: string;
  queries: string[];
  skillFrequency: Record<string, number>;
  missingSkills: string[];
  resumeKeywordGaps: string[];
  weeklyLearningPriorities: string[];
  rawResults: unknown[];
}

export interface PersistableBenchmarkSnapshot {
  generatedAt: string;
  queries: string[];
  skillFrequency: Record<string, number>;
  missingSkills: string[];
  resumeKeywordGaps: string[];
  weeklyLearningPriorities: string[];
  rawResults: unknown[];
}

export async function insertBenchmarkSnapshot(
  sql: SqlClient,
  snapshot: PersistableBenchmarkSnapshot,
): Promise<void> {
  await sql`
    insert into benchmark_snapshots (
      generated_at,
      queries,
      skill_frequency,
      missing_skills,
      resume_keyword_gaps,
      weekly_learning_priorities,
      raw_results
    )
    values (
      ${snapshot.generatedAt},
      ${snapshot.queries},
      ${JSON.stringify(snapshot.skillFrequency)}::jsonb,
      ${snapshot.missingSkills},
      ${snapshot.resumeKeywordGaps},
      ${snapshot.weeklyLearningPriorities},
      ${JSON.stringify(snapshot.rawResults)}::jsonb
    )
  `;
}

export async function getLatestBenchmarkSnapshot(
  sql: SqlClient,
): Promise<BenchmarkSnapshotRow | undefined> {
  const rows = await sql<RawBenchmarkRow[]>`
    select
      generated_at,
      queries,
      skill_frequency,
      missing_skills,
      resume_keyword_gaps,
      weekly_learning_priorities,
      raw_results
    from benchmark_snapshots
    order by generated_at desc
    limit 1
  `;

  return rows[0] ? benchmarkRowFromRaw(rows[0]) : undefined;
}

export async function getRecentBenchmarkSnapshots(
  sql: SqlClient,
  limit = 20,
): Promise<BenchmarkSnapshotRow[]> {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.floor(limit), 100))
    : 20;
  const rows = await sql<RawBenchmarkRow[]>`
    select
      generated_at,
      queries,
      skill_frequency,
      missing_skills,
      resume_keyword_gaps,
      weekly_learning_priorities,
      raw_results
    from benchmark_snapshots
    order by generated_at desc
    limit ${boundedLimit}
  `;

  return rows.map(benchmarkRowFromRaw);
}

type RawBenchmarkRow = {
  generated_at: Date | string;
  queries: string[] | string;
  skill_frequency: Record<string, number> | string;
  missing_skills: string[] | string;
  resume_keyword_gaps: string[] | string;
  weekly_learning_priorities: string[] | string;
  raw_results: unknown[] | string;
};

function benchmarkRowFromRaw(row: RawBenchmarkRow): BenchmarkSnapshotRow {
  return {
    generatedAt: toIso(row.generated_at),
    queries: parseArray(row.queries),
    skillFrequency: parseJsonObject(row.skill_frequency),
    missingSkills: parseArray(row.missing_skills),
    resumeKeywordGaps: parseArray(row.resume_keyword_gaps),
    weeklyLearningPriorities: parseArray(row.weekly_learning_priorities),
    rawResults: parseJsonArray(row.raw_results),
  };
}

function parseArray(value: string[] | string): string[] {
  return Array.isArray(value) ? value : JSON.parse(value) as string[];
}

function parseJsonObject(value: Record<string, number> | string): Record<string, number> {
  return typeof value === "string" ? (JSON.parse(value) as Record<string, number>) : value;
}

function parseJsonArray(value: unknown[] | string): unknown[] {
  return Array.isArray(value) ? value : (JSON.parse(value) as unknown[]);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
