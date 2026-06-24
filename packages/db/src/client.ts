import postgres from "postgres";
import { ConfigurationError, readRuntimeEnv, type RuntimeEnv } from "@repo/shared";

export type SqlClient = postgres.Sql;

export function createSqlClient(env: RuntimeEnv = readRuntimeEnv()): SqlClient {
  const DATABASE_URL = env.DATABASE_URL ?? env.DEVRANK_DATABASE_URL ?? env.SUPABASE_DATABASE_URL;

  if (!DATABASE_URL) {
    throw new ConfigurationError(
      "Database is not configured. Missing one of: DATABASE_URL, DEVRANK_DATABASE_URL, SUPABASE_DATABASE_URL",
    );
  }

  return postgres(DATABASE_URL, {
    max: 5,
    ssl: "require",
  });
}

export async function closeSqlClient(sql: SqlClient): Promise<void> {
  await sql.end({ timeout: 5 });
}

export async function runInTransaction<T>(
  sql: SqlClient,
  work: (transaction: SqlClient) => Promise<T>,
): Promise<T> {
  return sql.begin(async (transaction) =>
    work(transaction as unknown as SqlClient),
  ) as Promise<T>;
}
