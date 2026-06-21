#!/usr/bin/env node
import "dotenv/config";

import chokidar from "chokidar";
import { homedir } from "node:os";
import { join } from "node:path";
import { ingestLocalAiChats } from "@repo/ai-chat-ingestors";
import {
  closeSqlClient,
  createSqlClient,
  insertIngestionRun,
  upsertEvidenceItems,
} from "@repo/db";

export interface LocalAgentOptions {
  codexSessionsDir?: string;
  persist?: boolean;
  watch?: boolean;
}

export async function runLocalAgent(options: LocalAgentOptions = {}) {
  const codexSessionsDir =
    options.codexSessionsDir ?? join(homedir(), ".codex", "sessions");

  const result = await ingestAndMaybePersist(codexSessionsDir, options.persist ?? true);

  if (!options.watch) {
    return result;
  }

  const watcher = chokidar.watch(codexSessionsDir, {
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on("add", async () => {
    await ingestAndMaybePersist(codexSessionsDir, options.persist ?? true);
  });

  return {
    ...result,
    watching: codexSessionsDir,
  };
}

async function ingestAndMaybePersist(codexSessionsDir: string, persist: boolean) {
  const result = await ingestLocalAiChats({ codexSessionsDir });

  if (!persist) {
    return result;
  }

  const sql = createSqlClient();

  try {
    await upsertEvidenceItems(sql, result.evidence);
    await insertIngestionRun(sql, {
      source: `local_session:${codexSessionsDir}`,
      status: "success",
      summary: `Imported ${result.sessions.length} session(s) and ${result.evidence.length} evidence item(s).`,
    });
  } catch (error) {
    await insertIngestionRun(sql, {
      source: `local_session:${codexSessionsDir}`,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await closeSqlClient(sql);
  }

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const watch = process.argv.includes("--watch");
  const persist = !process.argv.includes("--dry-run");
  const dirIndex = process.argv.indexOf("--codex-sessions-dir");
  const codexSessionsDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : undefined;

  runLocalAgent({ codexSessionsDir, persist, watch })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
