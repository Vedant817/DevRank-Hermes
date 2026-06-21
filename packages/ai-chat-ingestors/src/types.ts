import type { EvidenceItem, EvidenceSource } from "@repo/shared";

export interface ChatMessage {
  role: "user" | "assistant" | "tool" | "system";
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
}

export interface IngestionResult {
  sessions: ParsedSession[];
  evidence: EvidenceItem[];
  redactionCount: number;
}
