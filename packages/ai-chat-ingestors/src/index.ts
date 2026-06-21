import { summarizeSession } from "./summarize.js";
import {
  codexDefaultRoot,
  localChatAdapters,
} from "./adapters.js";
import type { IngestionResult, LocalAiIngestionOptions } from "./types.js";

export async function ingestLocalAiChats(options: LocalAiIngestionOptions = {}): Promise<IngestionResult> {
  const sessions = [];
  const adapterCounts: Record<string, number> = {};
  const enabled = new Set(options.enabledAdapters ?? localChatAdapters.map((adapter) => adapter.name));

  for (const adapter of localChatAdapters) {
    if (!enabled.has(adapter.name)) {
      continue;
    }

    const roots = rootsForAdapter(adapter.name, options);
    const adapterSessions = await adapter.ingest(roots);
    adapterCounts[adapter.name] = adapterSessions.length;
    sessions.push(...adapterSessions);
  }

  return {
    sessions,
    evidence: sessions.map(summarizeSession),
    redactionCount: sessions.reduce((total, session) => total + session.redactions.length, 0),
    adapterCounts,
  };
}

function rootsForAdapter(
  adapterName: typeof localChatAdapters[number]["name"],
  options: LocalAiIngestionOptions,
) {
  if (options.sourceRoots && options.sourceRoots.length > 0) {
    return options.sourceRoots;
  }

  if (adapterName === "codex" && options.codexSessionsDir) {
    return [options.codexSessionsDir];
  }

  const adapter = localChatAdapters.find((candidate) => candidate.name === adapterName);

  return adapterName === "codex" ? [codexDefaultRoot] : adapter?.defaultRoots ?? [];
}

export * from "./adapters.js";
export * from "./antigravity.js";
export * from "./claude.js";
export * from "./codex.js";
export * from "./opencode.js";
export * from "./redaction.js";
export * from "./summarize.js";
export * from "./types.js";
