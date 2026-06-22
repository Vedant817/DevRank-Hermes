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
  embeddings: EvidenceEmbedding[];
  transcripts: AiChatTranscriptRecord[];
  redactionCount: number;
  adapterCounts: Record<string, number>;
  privacy: {
    embeddingStatus: "disabled" | "generated";
    rawStorageStatus: "local_only" | "redacted_cloud";
    redactionStatus: "passed";
    uploadRawChats: boolean;
    storeEmbeddings: boolean;
  };
}

export interface EvidenceEmbedding {
  embedding: number[];
  model: string;
  source: EvidenceSource;
  sourceId: string;
}

export type LocalAiEmbeddingGenerator = (texts: string[]) => Promise<{
  embeddings: number[][];
  model: string;
}>;

export interface AiChatTranscriptRecord {
  agentName: string;
  messages: ChatMessage[];
  rawStored: boolean;
  skillTags: string[];
  source: EvidenceSource;
  sourceId: string;
  sourcePath?: string;
  startedAt?: string;
  summary: string;
  title: string;
}

export interface LocalAiIngestionOptions {
  codexSessionsDir?: string;
  embeddingGenerator?: LocalAiEmbeddingGenerator;
  sourceRoots?: string[];
  enabledAdapters?: Array<"codex" | "claude" | "opencode" | "antigravity">;
  rawStorageEnabled?: boolean;
  redactSecrets?: boolean;
  storeEmbeddings?: boolean;
}
