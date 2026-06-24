import path from "node:path";
import { redactSecrets } from "./redaction.js";
import type { ParsedSession } from "./types.js";
import {
  asRecord,
  extractText,
  fileTimestamp,
  findFiles,
  readTextFile,
  stableId,
} from "./utils.js";

export async function parseAntigravityArtifact(filePath: string): Promise<ParsedSession> {
  const raw = await readTextFile(filePath);
  const redacted = redactSecrets(raw);
  const isJson = filePath.endsWith(".json");
  const record = isJson ? asRecord(JSON.parse(redacted.text)) : {};
  const content = isJson
    ? extractText(record.summary ?? record.content ?? record.title ?? record)
    : redacted.text.slice(0, 4_000);
  const title = extractText(record.title ?? record.artifactType) || path.basename(filePath);
  const updatedAt = record.updatedAt;

  return {
    id: stableId(filePath),
    source: "local_session",
    agentName: "Antigravity",
    title,
    sourcePath: filePath,
    startedAt: typeof updatedAt === "string" ? updatedAt : await fileTimestamp(filePath),
    messages: content.trim().length > 0
      ? [{
          role: "assistant",
          content,
          createdAt: typeof updatedAt === "string" ? updatedAt : undefined,
        }]
      : [],
    toolCalls: [],
    filesTouched: filePath.endsWith(".metadata.json")
      ? [filePath.replace(/\.metadata\.json$/, "")]
      : [],
    commandsRun: [],
    redactions: redacted.redactions,
    projectContext: path.dirname(filePath),
    skillTags: ["antigravity", "local-ai"],
  };
}

export async function ingestAntigravitySessions(roots: string[] | string): Promise<ParsedSession[]> {
  const resolvedRoots = Array.isArray(roots) ? roots : [roots];
  const sessions: ParsedSession[] = [];

  for (const root of resolvedRoots) {
    const files = await findFiles(
      root,
      (filePath) =>
        filePath.endsWith(".metadata.json") ||
        filePath.endsWith(".jsonl") ||
        filePath.endsWith(".log"),
      {
        excludeDirectoryNames: [
          "bin",
          "blob_storage",
          "CacheStorage",
          "Local Storage",
          "mcp",
          "node_modules",
          "Service Worker",
          "Session Storage",
          "WebStorage",
        ],
        maxFiles: 500,
      },
    );

    for (const file of files) {
      try {
        sessions.push(await parseAntigravityArtifact(file));
      } catch {
        continue;
      }
    }
  }

  return sessions;
}

export async function ingestAntigravityFiles(files: string[]): Promise<ParsedSession[]> {
  const sessions: ParsedSession[] = [];

  for (const filePath of files.filter(isSupportedAntigravityFile)) {
    try {
      sessions.push(await parseAntigravityArtifact(filePath));
    } catch {
      continue;
    }
  }

  return sessions;
}

function isSupportedAntigravityFile(filePath: string) {
  return filePath.endsWith(".metadata.json")
    || filePath.endsWith(".jsonl")
    || filePath.endsWith(".log");
}
