import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ChatMessage, MessageRole } from "./types.js";

export const MAX_LOCAL_AI_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_LOCAL_AI_DISCOVERED_FILES = 2_000;

export interface UnknownRecord {
  [key: string]: unknown;
}

export function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
}

export function stableId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n");
  }

  const record = asRecord(value);
  const direct = record.content ?? record.text ?? record.message ?? record.summary ?? record.title;

  if (direct !== undefined && direct !== value) {
    return extractText(direct);
  }

  return "";
}

export function detectRole(record: UnknownRecord, fallback: MessageRole = "user"): MessageRole {
  const role = String(record.role ?? record.type ?? record.author ?? record.sender ?? "").toLowerCase();

  if (role.includes("assistant") || role.includes("agent")) {
    return "assistant";
  }
  if (role.includes("tool") || role.includes("function")) {
    return "tool";
  }
  if (role.includes("system") || role.includes("queue") || role.includes("attachment")) {
    return "system";
  }
  if (role.includes("user") || role.includes("human")) {
    return "user";
  }

  return fallback;
}

export async function fileTimestamp(filePath: string): Promise<string> {
  const fileStats = await stat(filePath);

  return fileStats.birthtime.toISOString();
}

export async function readJsonlRecords(filePath: string): Promise<UnknownRecord[]> {
  const raw = await readTextFile(filePath);
  const records: UnknownRecord[] = [];

  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    records.push(asRecord(JSON.parse(line)));
  }

  return records;
}

export async function findFiles(
  root: string,
  predicate: (filePath: string) => boolean,
  options: {
    excludeDirectoryNames?: string[];
    maxFileBytes?: number;
    maxFiles?: number;
  } = {},
): Promise<string[]> {
  const rootStats = await stat(root).catch(() => undefined);
  const maxFiles = options.maxFiles ?? MAX_LOCAL_AI_DISCOVERED_FILES;
  const maxFileBytes = options.maxFileBytes ?? MAX_LOCAL_AI_FILE_BYTES;

  if (rootStats?.isFile()) {
    return predicate(root) && rootStats.size <= maxFileBytes ? [root] : [];
  }

  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  const excluded = new Set(options.excludeDirectoryNames ?? []);

  for (const entry of entries) {
    if (files.length >= maxFiles) {
      break;
    }

    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (excluded.has(entry.name)) {
        continue;
      }

      files.push(...(await findFiles(fullPath, predicate, {
        ...options,
        maxFiles: maxFiles - files.length,
      })));
    } else if (entry.isFile() && predicate(fullPath)) {
      const fileStats = await stat(fullPath).catch(() => undefined);

      if (fileStats && fileStats.size <= maxFileBytes) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export async function readTextFile(
  filePath: string,
  maxBytes = MAX_LOCAL_AI_FILE_BYTES,
): Promise<string> {
  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new Error("Local AI source path is not a regular file.");
  }

  if (fileStats.size > maxBytes) {
    throw new Error(`Local AI source file exceeds the ${maxBytes}-byte limit.`);
  }

  return readFile(filePath, "utf8");
}

export function messageFromRecord(
  record: UnknownRecord,
  fallbackRole: MessageRole,
): ChatMessage | undefined {
  const messageRecord = asRecord(record.message);
  const role = detectRole(messageRecord, detectRole(record, fallbackRole));
  const content = extractText(record.message ?? record.content ?? record.text ?? record.summary ?? record);

  if (content.trim().length === 0) {
    return undefined;
  }

  const createdAt = record.timestamp ?? record.createdAt ?? asRecord(record.time).created;

  return {
    role,
    content,
    createdAt: typeof createdAt === "string" ? createdAt : undefined,
  };
}

export function setFromKnownKeys(records: UnknownRecord[], keys: string[]): string[] {
  const values = new Set<string>();

  for (const record of records) {
    collectKnownStrings(record, new Set(keys), values);
  }

  return [...values];
}

function collectKnownStrings(value: unknown, keys: Set<string>, output: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKnownStrings(item, keys, output);
    }
    return;
  }

  const record = asRecord(value);

  for (const [key, item] of Object.entries(record)) {
    if (keys.has(key) && typeof item === "string" && item.trim().length > 0) {
      output.add(item);
    }

    if (typeof item === "object" && item !== null) {
      collectKnownStrings(item, keys, output);
    }
  }
}
