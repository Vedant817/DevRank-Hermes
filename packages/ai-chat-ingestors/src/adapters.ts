import { homedir } from "node:os";
import { join } from "node:path";
import type { ParsedSession } from "./types.js";
import {
  ingestAntigravityFiles,
  ingestAntigravitySessions,
} from "./antigravity.js";
import {
  ingestClaudeFiles,
  ingestClaudeSessions,
} from "./claude.js";
import {
  ingestCodexFiles,
  ingestCodexSessions,
} from "./codex.js";
import {
  ingestOpenCodeFiles,
  ingestOpenCodeSessions,
} from "./opencode.js";

export type LocalChatAdapterName = "codex" | "claude" | "opencode" | "antigravity";

export interface LocalChatAdapter {
  name: LocalChatAdapterName;
  defaultRoots: string[];
  ingest: (roots: string[]) => Promise<ParsedSession[]>;
  ingestFiles: (files: string[], roots: string[]) => Promise<ParsedSession[]>;
}

export const codexDefaultRoot = join(homedir(), ".codex", "sessions");
export const claudeDefaultRoot = join(homedir(), ".claude");
export const openCodeDefaultRoot = join(homedir(), ".local", "share", "opencode");
export const antigravityDefaultRoots = [
  join(homedir(), ".gemini", "antigravity"),
  join(homedir(), "Library", "Application Support", "Antigravity"),
];

export const localChatAdapters: LocalChatAdapter[] = [
  {
    name: "codex",
    defaultRoots: [codexDefaultRoot],
    ingest: async (roots) => ingestCodexSessions(roots),
    ingestFiles: async (files) => ingestCodexFiles(files),
  },
  {
    name: "claude",
    defaultRoots: [claudeDefaultRoot],
    ingest: async (roots) => ingestClaudeSessions(roots),
    ingestFiles: async (files) => ingestClaudeFiles(files),
  },
  {
    name: "opencode",
    defaultRoots: [openCodeDefaultRoot],
    ingest: async (roots) => ingestOpenCodeSessions(roots),
    ingestFiles: async (files, roots) => ingestOpenCodeFiles(files, roots),
  },
  {
    name: "antigravity",
    defaultRoots: antigravityDefaultRoots,
    ingest: async (roots) => ingestAntigravitySessions(roots),
    ingestFiles: async (files) => ingestAntigravityFiles(files),
  },
];

export const defaultLocalSourceRoots = localChatAdapters.flatMap((adapter) => adapter.defaultRoots);
