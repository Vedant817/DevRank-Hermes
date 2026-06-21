import { readFile } from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "./redaction.js";
import type { ChatMessage, ParsedSession } from "./types.js";
import {
  asRecord,
  detectRole,
  extractText,
  fileTimestamp,
  findFiles,
  stableId,
} from "./utils.js";

export async function parseClaudeSessionFile(filePath: string): Promise<ParsedSession> {
  const raw = await readFile(filePath, "utf8");
  const redacted = redactSecrets(raw);
  const messages: ChatMessage[] = [];
  const toolCalls = new Set<string>();
  const filesTouched = new Set<string>();
  const commandsRun = new Set<string>();
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
    const messageRecord = asRecord(record.message);
    const role = detectRole(messageRecord, detectRole(record));
    const content = extractText(record.message ?? record.content ?? record.text);

    if (content.trim().length > 0) {
      messages.push({
        role,
        content,
        createdAt: typeof record.timestamp === "string" ? record.timestamp : undefined,
      });
    }

    const toolName = record.toolName ?? record.tool_name ?? record.name;
    if (typeof toolName === "string") {
      toolCalls.add(toolName);
    }

    const command = record.command ?? record.cmd;
    if (typeof command === "string") {
      commandsRun.add(command);
    }

    const file = record.filePath ?? record.file_path ?? record.path;
    if (typeof file === "string") {
      filesTouched.add(file);
    }

    const cwd = record.cwd ?? record.projectPath;
    if (typeof cwd === "string") {
      projectContexts.add(cwd);
    }

    const branch = record.gitBranch;
    if (typeof branch === "string") {
      projectContexts.add(`git:${branch}`);
    }
  }

  return {
    id: stableId(filePath),
    source: "local_session",
    agentName: "Claude Code",
    title: messages[0]?.content.slice(0, 80) ?? path.basename(filePath),
    sourcePath: filePath,
    startedAt: messages[0]?.createdAt ?? await fileTimestamp(filePath),
    messages,
    toolCalls: [...toolCalls],
    filesTouched: [...filesTouched],
    commandsRun: [...commandsRun],
    redactions: redacted.redactions,
    projectContext: [...projectContexts].join("; ") || undefined,
    skillTags: ["claude", "local-ai"],
  };
}

function safeJsonParse(line: string): unknown | undefined {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

export async function ingestClaudeSessions(roots: string[] | string): Promise<ParsedSession[]> {
  const resolvedRoots = Array.isArray(roots) ? roots : [roots];
  const sessions: ParsedSession[] = [];

  for (const root of resolvedRoots) {
    const files = await findFiles(
      root,
      (filePath) => filePath.endsWith(".jsonl"),
      {
        excludeDirectoryNames: ["cache", "plugins", "telemetry"],
      },
    );

    for (const file of files) {
      sessions.push(await parseClaudeSessionFile(file));
    }
  }

  return sessions;
}
