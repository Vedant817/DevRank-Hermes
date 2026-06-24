import path from "node:path";
import { redactSecrets } from "./redaction.js";
import type { ParsedSession } from "./types.js";
import {
  asRecord,
  detectRole,
  extractText,
  fileTimestamp,
  findFiles,
  readTextFile,
  stableId,
} from "./utils.js";

export async function parseCodexSessionFile(filePath: string): Promise<ParsedSession> {
  const raw = await readTextFile(filePath);
  const redacted = redactSecrets(raw);
  const messages = [];
  const toolCalls = new Set<string>();
  const filesTouched = new Set<string>();
  const commandsRun = new Set<string>();
  const redactions = new Set(redacted.redactions);
  const projectContexts = new Set<string>();

  for (const line of redacted.text.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    const parsed: unknown = safeJsonParse(line);

    if (parsed === undefined) {
      continue;
    }

    const record = asRecord(parsed);
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

    const cwd = record.cwd ?? record.workdir ?? record.repository;
    if (typeof cwd === "string") {
      projectContexts.add(cwd);
    }
  }

  return {
    id: stableId(filePath),
    source: "local_session",
    agentName: "Codex",
    title: messages[0]?.content.slice(0, 80) ?? path.basename(filePath),
    sourcePath: filePath,
    startedAt: await fileTimestamp(filePath),
    messages,
    toolCalls: [...toolCalls],
    filesTouched: [...filesTouched],
    commandsRun: [...commandsRun],
    redactions: [...redactions],
    projectContext: [...projectContexts][0],
    skillTags: ["codex", "local-ai"],
  };
}

function safeJsonParse(line: string): unknown | undefined {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

export async function ingestCodexSessions(roots: string[] | string): Promise<ParsedSession[]> {
  const resolvedRoots = Array.isArray(roots) ? roots : [roots];
  const sessions = [];

  for (const root of resolvedRoots) {
    const files = await findFiles(root, (filePath) => filePath.endsWith(".jsonl"));

    for (const file of files) {
      sessions.push(await parseCodexSessionFile(file));
    }
  }

  return sessions;
}

export async function ingestCodexFiles(files: string[]): Promise<ParsedSession[]> {
  return Promise.all(
    files
      .filter((filePath) => filePath.endsWith(".jsonl"))
      .map((filePath) => parseCodexSessionFile(filePath)),
  );
}
