import { homedir } from "node:os";
import { join } from "node:path";
import type { ParsedSession } from "./types.js";
import { ingestAntigravitySessions } from "./antigravity.js";
import { ingestClaudeSessions } from "./claude.js";
import { ingestCodexSessions } from "./codex.js";
import { ingestOpenCodeSessions } from "./opencode.js";

export type LocalChatAdapterName = "codex" | "claude" | "opencode" | "antigravity";

export interface LocalChatAdapter {
  name: LocalChatAdapterName;
  defaultRoots: string[];
  ingest: (roots: string[]) => Promise<ParsedSession[]>;
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
  },
  {
    name: "claude",
    defaultRoots: [claudeDefaultRoot],
    ingest: async (roots) => ingestClaudeSessions(roots),
  },
  {
    name: "opencode",
    defaultRoots: [openCodeDefaultRoot],
    ingest: async (roots) => ingestOpenCodeSessions(roots),
  },
  {
    name: "antigravity",
    defaultRoots: antigravityDefaultRoots,
    ingest: async (roots) => ingestAntigravitySessions(roots),
  },
];

export const defaultLocalSourceRoots = localChatAdapters.flatMap((adapter) => adapter.defaultRoots);
