import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  closeSqlClient,
  createSqlClient,
  insertIngestionRun,
  listEvidenceItems,
  type SqlClient,
  upsertEvidenceItems,
} from "@repo/db";
import { extractSkillEvidence } from "@repo/hermes";
import type { LocalAgentWeeklySkillExtractionConfig } from "./config.js";

export interface LocalAgentState {
  ingestion?: {
    files?: Record<string, {
      mtimeMs: number;
      size: number;
    }>;
  };
  weeklySkillExtraction?: {
    lastEvidenceCount?: number;
    lastRunAt?: string;
    lastSkillCount?: number;
  };
}

export interface WeeklySkillExtractionResult {
  evidenceCount: number;
  reason?: string;
  ran: boolean;
  skillCount: number;
  statePath: string;
  writtenEvidence: number;
}

export async function runWeeklySkillExtractionIfDue(input: {
  config: LocalAgentWeeklySkillExtractionConfig;
  force?: boolean;
  now?: Date;
  persist: boolean;
  sql?: SqlClient;
}): Promise<WeeklySkillExtractionResult> {
  const now = input.now ?? new Date();
  const state = await readLocalAgentState(input.config.statePath);

  if (!input.config.enabled) {
    return skippedResult(input.config.statePath, "disabled");
  }

  if (!input.persist) {
    return skippedResult(input.config.statePath, "persistence_disabled");
  }

  if (!input.force && !shouldRunWeeklySkillExtraction(state, input.config, now)) {
    return skippedResult(input.config.statePath, "not_due");
  }

  const sql = input.sql ?? createSqlClient();
  const shouldClose = input.sql === undefined;

  try {
    const evidence = await listEvidenceItems(sql, {
      limit: input.config.evidenceLimit,
    });
    const skillEvidence = extractSkillEvidence(evidence, {
      generatedAt: now.toISOString(),
    });
    const writtenEvidence = await upsertEvidenceItems(sql, skillEvidence);

    await insertIngestionRun(sql, {
      source: "hermes_skill_extraction",
      status: "success",
      summary: `Extracted ${skillEvidence.length} skill evidence item(s) from ${evidence.length} evidence item(s).`,
    });
    await writeLocalAgentState(input.config.statePath, {
      ...state,
      weeklySkillExtraction: {
        lastEvidenceCount: evidence.length,
        lastRunAt: now.toISOString(),
        lastSkillCount: skillEvidence.length,
      },
    });

    return {
      evidenceCount: evidence.length,
      ran: true,
      skillCount: skillEvidence.length,
      statePath: input.config.statePath,
      writtenEvidence,
    };
  } catch (error) {
    await insertIngestionRun(sql, {
      source: "hermes_skill_extraction",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  } finally {
    if (shouldClose) {
      await closeSqlClient(sql);
    }
  }
}

export function shouldRunWeeklySkillExtraction(
  state: LocalAgentState,
  config: LocalAgentWeeklySkillExtractionConfig,
  now = new Date(),
) {
  const lastRunAt = state.weeklySkillExtraction?.lastRunAt;

  if (!lastRunAt) {
    return true;
  }

  const lastRunTime = new Date(lastRunAt).getTime();

  if (!Number.isFinite(lastRunTime)) {
    return true;
  }

  const intervalMs = config.intervalDays * 24 * 60 * 60 * 1_000;

  return now.getTime() - lastRunTime >= intervalMs;
}

export async function readLocalAgentState(statePath: string): Promise<LocalAgentState> {
  try {
    return normalizeState(JSON.parse(await readFile(statePath, "utf8")));
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    throw error;
  }
}

export async function writeLocalAgentState(statePath: string, state: LocalAgentState) {
  await mkdir(dirname(statePath), { recursive: true });
  const temporaryPath = join(
    dirname(statePath),
    `.${basename(statePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, statePath);
  await chmod(statePath, 0o600);
}

function skippedResult(statePath: string, reason: string): WeeklySkillExtractionResult {
  return {
    evidenceCount: 0,
    ran: false,
    reason,
    skillCount: 0,
    statePath,
    writtenEvidence: 0,
  };
}

function normalizeState(value: unknown): LocalAgentState {
  const record = asRecord(value);
  const ingestion = asRecord(record.ingestion);
  const files = asRecord(ingestion.files);
  const weeklySkillExtraction = asRecord(record.weeklySkillExtraction);
  const lastRunAt = weeklySkillExtraction.lastRunAt;

  return {
    ingestion: {
      files: Object.fromEntries(
        Object.entries(files).flatMap(([filePath, checkpoint]) => {
          const checkpointRecord = asRecord(checkpoint);
          const mtimeMs = numberValue(checkpointRecord.mtimeMs);
          const size = numberValue(checkpointRecord.size);

          return mtimeMs === undefined || size === undefined
            ? []
            : [[filePath, { mtimeMs, size }]];
        }),
      ),
    },
    weeklySkillExtraction: {
      lastEvidenceCount: numberValue(weeklySkillExtraction.lastEvidenceCount),
      lastRunAt: typeof lastRunAt === "string" ? lastRunAt : undefined,
      lastSkillCount: numberValue(weeklySkillExtraction.lastSkillCount),
    },
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
