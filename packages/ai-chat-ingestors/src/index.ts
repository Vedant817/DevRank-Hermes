import { summarizeSession } from "./summarize.js";
import {
  codexDefaultRoot,
  localChatAdapters,
} from "./adapters.js";
import type { IngestionResult, LocalAiIngestionOptions } from "./types.js";

export async function ingestLocalAiChats(options: LocalAiIngestionOptions = {}): Promise<IngestionResult> {
  const privacy = resolvePrivacy(options);
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
    privacy,
  };
}

function resolvePrivacy(options: LocalAiIngestionOptions): IngestionResult["privacy"] {
  if (options.redactSecrets === false) {
    throw new Error("Local AI ingestion requires secret redaction for production-safe evidence.");
  }

  if (options.rawStorageEnabled === true) {
    throw new Error("Raw chat cloud storage is not implemented; keep raw transcripts local.");
  }

  if (options.storeEmbeddings === true) {
    throw new Error("Embedding storage is not implemented; enable it only after a real embedding provider is wired.");
  }

  return {
    embeddingStatus: "disabled",
    rawStorageStatus: "local_only",
    redactionStatus: "passed",
    uploadRawChats: false,
    storeEmbeddings: false,
  };
}

function rootsForAdapter(
  adapterName: typeof localChatAdapters[number]["name"],
  options: LocalAiIngestionOptions,
) {
  if (options.sourceRoots && options.sourceRoots.length > 0) {
    if (options.enabledAdapters?.length === 1) {
      return options.sourceRoots;
    }

    return options.sourceRoots.filter((root) => rootMatchesAdapter(adapterName, root));
  }

  if (adapterName === "codex" && options.codexSessionsDir) {
    return [options.codexSessionsDir];
  }

  const adapter = localChatAdapters.find((candidate) => candidate.name === adapterName);

  return adapterName === "codex" ? [codexDefaultRoot] : adapter?.defaultRoots ?? [];
}

function rootMatchesAdapter(
  adapterName: typeof localChatAdapters[number]["name"],
  root: string,
) {
  const normalized = root.toLowerCase();

  if (adapterName === "codex") {
    return normalized.includes(".codex");
  }
  if (adapterName === "claude") {
    return normalized.includes(".claude");
  }
  if (adapterName === "opencode") {
    return normalized.includes("opencode");
  }

  return normalized.includes("antigravity");
}

export * from "./adapters.js";
export * from "./antigravity.js";
export * from "./claude.js";
export * from "./codex.js";
export * from "./opencode.js";
export * from "./redaction.js";
export * from "./summarize.js";
export * from "./types.js";
