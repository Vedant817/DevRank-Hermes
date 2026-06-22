#!/usr/bin/env node
import "dotenv/config";

import chokidar from "chokidar";
import { codexDefaultRoot, ingestLocalAiChats } from "@repo/ai-chat-ingestors";
import {
  closeSqlClient,
  createSqlClient,
  insertIngestionRun,
  upsertEvidenceItems,
} from "@repo/db";
import { loadLocalAgentConfig, type LocalAgentPrivacyConfig } from "./config.js";

export interface LocalAgentOptions {
  codexSessionsDir?: string;
  configPath?: string;
  persist?: boolean;
  privacy?: Partial<LocalAgentPrivacyConfig>;
  sources?: string[];
  watch?: boolean;
}

export async function runLocalAgent(options: LocalAgentOptions = {}) {
  const config = await loadLocalAgentConfig({
    codexSessionsDir: options.codexSessionsDir,
    configPath: options.configPath,
    privacy: options.privacy,
    sources: options.sources,
  });
  const codexSessionsDir = options.codexSessionsDir
    ?? config.sources.find((source) => source.includes(".codex"))
    ?? codexDefaultRoot;
  const sourceRoots = config.sources;
  const persist = options.persist ?? true;

  const result = await ingestAndMaybePersist({
    codexSessionsDir,
    persist,
    sourceRoots,
  });

  if (!options.watch) {
    return result;
  }

  const watcher = chokidar.watch(sourceRoots, {
    ignored: /(^|[/\\])(node_modules|bin|CacheStorage|WebStorage|Service Worker)([/\\]|$)/,
    ignoreInitial: true,
    persistent: true,
  });

  const reingest = async () => {
    await ingestAndMaybePersist({
      codexSessionsDir,
      persist,
      sourceRoots,
    });
  };

  watcher.on("add", reingest);
  watcher.on("change", reingest);

  return {
    ...result,
    privacy: config.privacy,
    watching: sourceRoots,
  };
}

async function ingestAndMaybePersist(input: {
  codexSessionsDir: string;
  persist: boolean;
  sourceRoots: string[];
}) {
  const result = await ingestLocalAiChats({
    codexSessionsDir: input.codexSessionsDir,
    sourceRoots: input.sourceRoots,
  });

  if (!input.persist) {
    return result;
  }

  const sql = createSqlClient();

  try {
    await upsertEvidenceItems(sql, result.evidence);
    await insertIngestionRun(sql, {
      source: `local_session:${input.codexSessionsDir}`,
      status: "success",
      summary: `Imported ${result.sessions.length} session(s) and ${result.evidence.length} evidence item(s).`,
    });
  } catch (error) {
    await insertIngestionRun(sql, {
      source: `local_session:${input.codexSessionsDir}`,
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
  const configIndex = process.argv.indexOf("--config");
  const dirIndex = process.argv.indexOf("--codex-sessions-dir");
  const configPath = configIndex >= 0 ? process.argv[configIndex + 1] : undefined;
  const codexSessionsDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : undefined;
  const sources = process.argv
    .map((arg, index) => arg === "--source" ? process.argv[index + 1] : undefined)
    .filter((source): source is string => typeof source === "string");

  runLocalAgent({ codexSessionsDir, configPath, persist, sources: sources.length > 0 ? sources : undefined, watch })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

export * from "./config.js";
export * from "./launchd.js";
