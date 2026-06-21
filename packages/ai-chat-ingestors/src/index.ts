import { summarizeSession } from "./summarize.js";
import { ingestCodexSessions } from "./codex.js";
import type { IngestionResult } from "./types.js";

export async function ingestLocalAiChats(options: {
  codexSessionsDir?: string;
}): Promise<IngestionResult> {
  const sessions = [];

  if (options.codexSessionsDir) {
    sessions.push(...(await ingestCodexSessions(options.codexSessionsDir)));
  }

  return {
    sessions,
    evidence: sessions.map(summarizeSession),
    redactionCount: sessions.reduce((total, session) => total + session.redactions.length, 0),
  };
}

export * from "./codex.js";
export * from "./redaction.js";
export * from "./summarize.js";
export * from "./types.js";
