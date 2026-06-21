import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "./redaction.js";
import type { ChatMessage, ParsedSession } from "./types.js";
import {
  asRecord,
  extractText,
  fileTimestamp,
  findFiles,
  stableId,
} from "./utils.js";

type MessageRecord = {
  id?: string;
  sessionID?: string;
  role?: string;
  time?: { created?: string };
  summary?: { title?: string };
  agent?: string;
  tools?: Record<string, unknown>;
};

export async function parseOpenCodeSessionDir(sessionDir: string): Promise<ParsedSession> {
  const files = await findFiles(sessionDir, (filePath) => filePath.endsWith(".json"));
  const messages: ChatMessage[] = [];
  const toolCalls = new Set<string>();
  const redactions = new Set<string>();
  let sessionId = path.basename(sessionDir);
  let title = path.basename(sessionDir);
  let startedAt: string | undefined;

  for (const file of files.sort()) {
    const raw = await readFile(file, "utf8");
    const redacted = redactSecrets(raw);
    redacted.redactions.forEach((redaction) => redactions.add(redaction));
    const parsed = safeJsonParse(redacted.text);

    if (!parsed) {
      continue;
    }

    const record = parsed as MessageRecord;

    sessionId = record.sessionID ?? sessionId;

    if (record.summary?.title) {
      title = record.summary.title;
    }

    for (const toolName of Object.keys(record.tools ?? {})) {
      toolCalls.add(toolName);
    }

    const parts = await readOpenCodeParts(sessionDir, record.id);
    parts.redactions.forEach((redaction) => redactions.add(redaction));
    const content = [record.summary?.title, ...parts.map((part) => part.text)].filter(Boolean).join("\n");

    if (content.trim().length > 0) {
      messages.push({
        role: record.role === "assistant" ? "assistant" : "user",
        content,
        createdAt: record.time?.created,
      });
    }

    startedAt ??= record.time?.created;
  }

  return {
    id: stableId(sessionDir),
    source: "local_session",
    agentName: "OpenCode",
    title,
    sourcePath: sessionDir,
    startedAt: startedAt ?? await fileTimestamp(sessionDir),
    messages,
    toolCalls: [...toolCalls],
    filesTouched: [],
    commandsRun: [],
    redactions: [...redactions],
    projectContext: sessionId,
    skillTags: ["opencode", "local-ai"],
  };
}

export async function ingestOpenCodeSessions(roots: string[] | string): Promise<ParsedSession[]> {
  const resolvedRoots = Array.isArray(roots) ? roots : [roots];
  const sessions: ParsedSession[] = [];

  for (const root of resolvedRoots) {
    const messageRoot = path.join(root, "storage", "message");
    const entries = await readdir(messageRoot, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (entry.isDirectory()) {
        sessions.push(await parseOpenCodeSessionDir(path.join(messageRoot, entry.name)));
      }
    }
  }

  return sessions;
}

interface OpenCodePartResult extends Array<{ text: string }> {
  redactions: string[];
}

async function readOpenCodeParts(sessionDir: string, messageId: string | undefined): Promise<OpenCodePartResult> {
  const parts: OpenCodePartResult = Object.assign([], { redactions: [] as string[] });

  if (!messageId) {
    return parts;
  }

  const storageRoot = path.resolve(sessionDir, "..", "..");
  const partDir = path.join(storageRoot, "part", messageId);
  const files = await findFiles(partDir, (filePath) => filePath.endsWith(".json"));

  for (const file of files.sort()) {
    const redacted = redactSecrets(await readFile(file, "utf8"));
    parts.redactions.push(...redacted.redactions);

    const parsed = safeJsonParse(redacted.text);

    if (!parsed) {
      continue;
    }

    const record = asRecord(parsed);
    const text = extractText(record.text ?? record.content ?? record);

    if (text.trim().length > 0) {
      parts.push({ text });
    }
  }

  return parts;
}

function safeJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
