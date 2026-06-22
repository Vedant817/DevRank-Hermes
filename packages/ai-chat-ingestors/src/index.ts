import { embedTexts } from "@repo/embeddings";
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

  const evidence = sessions.map(summarizeSession);
  const embeddings = privacy.storeEmbeddings
    ? await buildEmbeddings(evidence, options.embeddingGenerator ?? ((texts) => embedTexts(texts)))
    : [];
  const transcripts = privacy.uploadRawChats ? buildTranscriptRecords(sessions, evidence) : [];

  return {
    sessions,
    evidence,
    embeddings,
    transcripts,
    redactionCount: sessions.reduce((total, session) => total + session.redactions.length, 0),
    adapterCounts,
    privacy,
  };
}

function resolvePrivacy(options: LocalAiIngestionOptions): IngestionResult["privacy"] {
  if (options.redactSecrets === false) {
    throw new Error("Local AI ingestion requires secret redaction for production-safe evidence.");
  }

  return {
    embeddingStatus: options.storeEmbeddings === true ? "generated" : "disabled",
    rawStorageStatus: options.rawStorageEnabled === true ? "redacted_cloud" : "local_only",
    redactionStatus: "passed",
    uploadRawChats: options.rawStorageEnabled === true,
    storeEmbeddings: options.storeEmbeddings === true,
  };
}

function buildTranscriptRecords(
  sessions: IngestionResult["sessions"],
  evidence: IngestionResult["evidence"],
): IngestionResult["transcripts"] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  return sessions.map((session) => {
    const item = evidenceById.get(session.id);

    return {
      agentName: session.agentName,
      messages: session.messages,
      rawStored: true,
      skillTags: session.skillTags,
      source: session.source,
      sourceId: session.id,
      sourcePath: session.sourcePath,
      startedAt: session.startedAt,
      summary: item?.summary ?? session.title,
      title: session.title,
    };
  });
}

async function buildEmbeddings(
  evidence: IngestionResult["evidence"],
  embeddingGenerator: NonNullable<LocalAiIngestionOptions["embeddingGenerator"]>,
): Promise<IngestionResult["embeddings"]> {
  if (evidence.length === 0) {
    return [];
  }

  const result = await embeddingGenerator(evidence.map((item) => `${item.title}\n\n${item.summary}`));

  if (result.embeddings.length !== evidence.length) {
    throw new Error("Embedding generator returned a different vector count than the evidence count.");
  }

  return evidence.map((item, index) => ({
    embedding: result.embeddings[index] ?? [],
    model: result.model,
    source: item.source,
    sourceId: item.id,
  }));
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
