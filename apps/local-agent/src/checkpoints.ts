import { stat } from "node:fs/promises";
import { MAX_LOCAL_AI_FILE_BYTES } from "@repo/ai-chat-ingestors";
import {
  readLocalAgentState,
  writeLocalAgentState,
  type LocalAgentState,
} from "./skill-extraction.js";

export const MAX_LOCAL_AGENT_WATCH_BATCH = 100;
export const MAX_LOCAL_AGENT_CHECKPOINTS = 20_000;

export interface SourceFileCheckpoint {
  mtimeMs: number;
  size: number;
}

export interface ChangedSourceFiles {
  checkpoints: Record<string, SourceFileCheckpoint>;
  sourceFiles: string[];
}

export function drainPendingSourceFiles(
  pending: Set<string>,
  limit = MAX_LOCAL_AGENT_WATCH_BATCH,
) {
  const batch = [...pending].slice(0, limit);
  batch.forEach((filePath) => pending.delete(filePath));

  return batch;
}

export async function inspectChangedSourceFiles(
  files: string[],
  state: LocalAgentState,
): Promise<ChangedSourceFiles> {
  const checkpoints: Record<string, SourceFileCheckpoint> = {};
  const sourceFiles: string[] = [];
  const previous = state.ingestion?.files ?? {};

  for (const filePath of [...new Set(files)].slice(0, MAX_LOCAL_AGENT_WATCH_BATCH)) {
    const fileStats = await stat(filePath).catch(() => undefined);

    if (!fileStats?.isFile()) {
      continue;
    }

    const checkpoint = {
      mtimeMs: fileStats.mtimeMs,
      size: fileStats.size,
    };
    const prior = previous[filePath];

    if (prior?.mtimeMs === checkpoint.mtimeMs && prior.size === checkpoint.size) {
      continue;
    }

    checkpoints[filePath] = checkpoint;

    if (fileStats.size <= MAX_LOCAL_AI_FILE_BYTES) {
      sourceFiles.push(filePath);
    }
  }

  return { checkpoints, sourceFiles };
}

export async function persistSourceFileCheckpoints(
  statePath: string,
  checkpoints: Record<string, SourceFileCheckpoint>,
) {
  if (Object.keys(checkpoints).length === 0) {
    return;
  }

  const state = await readLocalAgentState(statePath);
  const files = Object.fromEntries(
    Object.entries({
      ...state.ingestion?.files,
      ...checkpoints,
    })
      .sort(([, left], [, right]) => right.mtimeMs - left.mtimeMs)
      .slice(0, MAX_LOCAL_AGENT_CHECKPOINTS),
  );

  await writeLocalAgentState(statePath, {
    ...state,
    ingestion: {
      files,
    },
  });
}
