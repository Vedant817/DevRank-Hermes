import { migrations } from "./schema.js";
import {
  closeSqlClient,
  createSqlClient,
  runInTransaction,
  type SqlClient,
} from "./client.js";
import type { RuntimeEnv } from "@repo/shared";

const MIGRATION_LOCK_NAMESPACE = "devrank-os";
const MIGRATION_LOCK_KEY = "schema-migrations";

export async function runMigrations(sql: SqlClient): Promise<string[]> {
  return runInTransaction(sql, async (transaction) => {
    await transaction`
      select pg_advisory_xact_lock(
        hashtext(${MIGRATION_LOCK_NAMESPACE}),
        hashtext(${MIGRATION_LOCK_KEY})
      )
    `;

    await transaction`
      create table if not exists schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const applied: string[] = [];

    for (const migration of migrations) {
      const rows = await transaction<{ id: string }[]>`
        select id from schema_migrations where id = ${migration.id}
      `;

      if (rows.length > 0) {
        continue;
      }

      await transaction.unsafe(migration.sql);
      await transaction`
        insert into schema_migrations (id) values (${migration.id})
      `;
      applied.push(migration.id);
    }

    return applied;
  });
}

export async function runDbMigrations(env?: RuntimeEnv): Promise<{
  applied: string[];
}> {
  const sql = createSqlClient(env);

  try {
    return {
      applied: await runMigrations(sql),
    };
  } finally {
    await closeSqlClient(sql);
  }
}

export async function checkVectorSupport(env?: RuntimeEnv): Promise<{
  extensionInstalled: boolean;
  distance: number;
}> {
  const sql = createSqlClient(env);

  try {
    const extensionRows = await sql<{ exists: boolean }[]>`
      select exists (
        select 1 from pg_extension where extname = 'vector'
      ) as "exists"
    `;

    const vectorRows = await sql<{ distance: number }[]>`
      select ('[1,2,3]'::vector <=> '[1,2,3]'::vector)::float8 as distance
    `;

    return {
      extensionInstalled: extensionRows[0]?.exists ?? false,
      distance: vectorRows[0]?.distance ?? Number.NaN,
    };
  } finally {
    await closeSqlClient(sql);
  }
}
