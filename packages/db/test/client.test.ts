import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import { runInTransaction } from "../src/client.js";

test("runs logical persistence work through the database transaction callback", async () => {
  const transaction = {} as SqlClient;
  let beginCalls = 0;
  const sql = {
    begin: async (work: (client: SqlClient) => Promise<string>) => {
      beginCalls += 1;
      return work(transaction);
    },
  } as unknown as SqlClient;

  const result = await runInTransaction(sql, async (client) => {
    assert.equal(client, transaction);
    return "committed";
  });

  assert.equal(result, "committed");
  assert.equal(beginCalls, 1);
});

test("propagates transaction failures to the owning workflow", async () => {
  const sql = {
    begin: async (work: (client: SqlClient) => Promise<never>) =>
      work({} as SqlClient),
  } as unknown as SqlClient;

  await assert.rejects(
    runInTransaction(sql, async () => {
      throw new Error("write failed");
    }),
    /write failed/,
  );
});
