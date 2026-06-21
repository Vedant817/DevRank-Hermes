import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "./redaction.js";
import type { ParsedSession } from "./types.js";

interface UnknownRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n");
  }

  const record = asRecord(value);
  const content = record.content ?? record.text ?? record.message;

  if (content !== undefined) {
    return extractText(content);
  }

  return "";
}

function detectRole(record: UnknownRecord): "user" | "assistant" | "tool" | "system" {
  const role = String(record.role ?? record.type ?? "").toLowerCase();

  if (role.includes("assistant")) {
    return "assistant";
  }
  if (role.includes("tool")) {
    return "tool";
  }
  if (role.includes("system")) {
    return "system";
  }

  return "user";
}

function stableId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

async function findJsonlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findJsonlFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function parseCodexSessionFile(filePath: string): Promise<ParsedSession> {
  const raw = await readFile(filePath, "utf8");
  const redacted = redactSecrets(raw);
  const messages = [];
  const toolCalls = new Set<string>();
  const filesTouched = new Set<string>();
  const commandsRun = new Set<string>();
  const redactions = new Set(redacted.redactions);

  for (const line of redacted.text.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    const record = asRecord(JSON.parse(line));
    const role = detectRole(record);
    const content = extractText(record.item ?? record.message ?? record);

    if (content.trim().length > 0) {
      messages.push({
        role,
        content,
        createdAt: typeof record.timestamp === "string" ? record.timestamp : undefined,
      });
    }

    const toolName = record.tool_name ?? record.name;
    if (typeof toolName === "string") {
      toolCalls.add(toolName);
    }

    const command = record.cmd ?? record.command;
    if (typeof command === "string") {
      commandsRun.add(command);
    }

    const pathValue = record.path ?? record.file_path;
    if (typeof pathValue === "string") {
      filesTouched.add(pathValue);
    }
  }

  const fileStats = await stat(filePath);

  return {
    id: stableId(filePath),
    source: "local_session",
    agentName: "Codex",
    title: messages[0]?.content.slice(0, 80) ?? path.basename(filePath),
    sourcePath: filePath,
    startedAt: fileStats.birthtime.toISOString(),
    messages,
    toolCalls: [...toolCalls],
    filesTouched: [...filesTouched],
    commandsRun: [...commandsRun],
    redactions: [...redactions],
  };
}

export async function ingestCodexSessions(root: string): Promise<ParsedSession[]> {
  const files = await findJsonlFiles(root);
  const sessions = [];

  for (const file of files) {
    sessions.push(await parseCodexSessionFile(file));
  }

  return sessions;
}
