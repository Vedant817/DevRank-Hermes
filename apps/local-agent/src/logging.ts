import { chmod, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

export const MAX_LOCAL_AGENT_LOG_BYTES = 1_000_000;

export interface LocalAgentLogEntry {
  adapters?: Record<string, number>;
  embeddings?: number;
  event: "ingestion_complete" | "ingestion_failed" | "watch_failed";
  evidence?: number;
  redactions?: number;
  sessions?: number;
  transcripts?: number;
  watching?: number;
}

export async function writeLocalAgentLog(
  entry: LocalAgentLogEntry,
  logPath = process.env.DEVRANK_LOCAL_AGENT_LOG_PATH,
): Promise<void> {
  const line = `${JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  })}\n`;

  if (!logPath) {
    process.stdout.write(line);
    return;
  }

  await mkdir(dirname(logPath), { recursive: true });
  const currentSize = (await stat(logPath).catch(() => undefined))?.size ?? 0;

  if (currentSize + Buffer.byteLength(line) > MAX_LOCAL_AGENT_LOG_BYTES) {
    await rm(`${logPath}.1`, { force: true });
    await rename(logPath, `${logPath}.1`).catch(() => undefined);
    // A rotated file keeps its old (possibly permissive) mode, so re-lock it.
    await chmod(`${logPath}.1`, 0o600).catch((error: unknown) => {
      if (process.platform !== "win32") {
        console.warn(`DevRank: could not lock rotated log permissions: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  const handle = await open(logPath, "a", 0o600);

  try {
    await handle.writeFile(line, "utf8");
  } finally {
    await handle.close();
  }

  // Best-effort POSIX lockdown. No-op on Windows, where log privacy relies on
  // the user's profile directory ACLs — see the platform guard in
  // test/logging.test.ts. Warn on POSIX so silent EPERM/ROFS never hides a
  // real permissions failure.
  await chmod(logPath, 0o600).catch((error: unknown) => {
    if (process.platform !== "win32") {
      console.warn(`DevRank: could not lock log permissions: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function summarizeLocalAgentResult(result: {
  adapterCounts?: Record<string, number>;
  embeddings?: unknown[];
  evidence?: unknown[];
  redactionCount?: number;
  sessions?: unknown[];
  transcripts?: unknown[];
  watching?: unknown[];
}): LocalAgentLogEntry {
  return {
    adapters: result.adapterCounts ?? {},
    embeddings: result.embeddings?.length ?? 0,
    event: "ingestion_complete",
    evidence: result.evidence?.length ?? 0,
    redactions: result.redactionCount ?? 0,
    sessions: result.sessions?.length ?? 0,
    transcripts: result.transcripts?.length ?? 0,
    watching: result.watching?.length ?? 0,
  };
}
