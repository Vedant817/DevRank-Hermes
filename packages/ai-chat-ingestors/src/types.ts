import type { EvidenceItem, EvidenceSource } from "@repo/shared";

export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  createdAt?: string;
}

export interface ParsedSession {
  id: string;
  source: EvidenceSource;
  agentName: string;
  title: string;
  sourcePath?: string;
  startedAt?: string;
  messages: ChatMessage[];
  toolCalls: string[];
  filesTouched: string[];
  commandsRun: string[];
  redactions: string[];
  projectContext?: string;
  skillTags: string[];
}

export interface IngestionResult {
  sessions: ParsedSession[];
  evidence: EvidenceItem[];
  redactionCount: number;
  adapterCounts: Record<string, number>;
  privacy: {
    embeddingStatus: "disabled";
    rawStorageStatus: "local_only";
    redactionStatus: "passed";
    uploadRawChats: false;
    storeEmbeddings: false;
  };
}

export interface LocalAiIngestionOptions {
  codexSessionsDir?: string;
  sourceRoots?: string[];
  enabledAdapters?: Array<"codex" | "claude" | "opencode" | "antigravity">;
  rawStorageEnabled?: boolean;
  redactSecrets?: boolean;
  storeEmbeddings?: boolean;
}
