import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import { runMigrations } from "../src/migrate.js";
import { migrations } from "../src/schema.js";

test("serializes and atomically records migration execution", async () => {
  const events: string[] = [];
  const transaction = createMigrationSql(events);
  const sql = Object.assign(createMigrationSql(events), {
    begin: async <T>(work: (value: SqlClient) => Promise<T>) => {
      events.push("begin");

      try {
        const result = await work(transaction);
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    },
  }) as unknown as SqlClient;

  const applied = await runMigrations(sql);

  assert.deepEqual(applied, migrations.map((migration) => migration.id));
  assert.equal(events[0], "begin");
  assert.equal(events[1], "lock");
  assert.equal(events[2], "create-migration-table");
  assert.equal(events.at(-1), "commit");
  assert.equal(events.filter((event) => event === "unsafe").length, migrations.length);
  assert.equal(events.filter((event) => event === "record").length, migrations.length);
});

test("rolls back without recording a migration when its SQL fails", async () => {
  const events: string[] = [];
  const transaction = createMigrationSql(events, true);
  const sql = Object.assign(createMigrationSql(events), {
    begin: async <T>(work: (value: SqlClient) => Promise<T>) => {
      events.push("begin");

      try {
        const result = await work(transaction);
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    },
  }) as unknown as SqlClient;

  await assert.rejects(() => runMigrations(sql), /migration failed/);
  assert.equal(events.at(-1), "rollback");
  assert.equal(events.includes("commit"), false);
  assert.equal(events.includes("record"), false);
});

function createMigrationSql(events: string[], failUnsafe = false): SqlClient {
  const client = (async (strings: TemplateStringsArray) => {
    const statement = strings.join(" ").replace(/\s+/g, " ").trim().toLowerCase();

    if (statement.includes("pg_advisory_xact_lock")) {
      events.push("lock");
      return [];
    }

    if (statement.includes("create table if not exists schema_migrations")) {
      events.push("create-migration-table");
      return [];
    }

    if (statement.includes("select id from schema_migrations")) {
      events.push("check");
      return [];
    }

    if (statement.includes("insert into schema_migrations")) {
      events.push("record");
      return [];
    }

    throw new Error(`Unexpected migration SQL: ${statement}`);
  }) as unknown as SqlClient;

  client.unsafe = async () => {
    events.push("unsafe");

    if (failUnsafe) {
      throw new Error("migration failed");
    }

    return [];
  };

  return client;
}
