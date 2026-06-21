import type { EvidenceItem } from "@repo/shared";
import type { ParsedSession } from "./types.js";

function firstNonEmpty(lines: string[]): string {
  return lines.find((line) => line.trim().length > 0)?.trim() ?? "Untitled session";
}

export function summarizeSession(session: ParsedSession): EvidenceItem {
  const userPrompts = session.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  const assistantMessages = session.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content);

  const title = session.title || firstNonEmpty(userPrompts);
  const summaryParts = [
    `Agent: ${session.agentName}.`,
    userPrompts.length > 0
      ? `User asked: ${firstNonEmpty(userPrompts).slice(0, 240)}`
      : "No user prompt was detected.",
    assistantMessages.length > 0
      ? `Assistant responded with ${assistantMessages.length} message(s).`
      : "No assistant response was detected.",
    session.commandsRun.length > 0
      ? `Commands: ${session.commandsRun.slice(0, 5).join(", ")}.`
      : "",
    session.filesTouched.length > 0
      ? `Files: ${session.filesTouched.slice(0, 5).join(", ")}.`
      : "",
    session.projectContext ? `Project context: ${session.projectContext}.` : "",
  ].filter(Boolean);

  return {
    id: session.id,
    source: session.source,
    title,
    summary: summaryParts.join(" "),
    occurredAt: session.startedAt ?? new Date().toISOString(),
    metadata: {
      sourcePath: session.sourcePath,
      toolCalls: session.toolCalls,
      filesTouched: session.filesTouched,
      commandsRun: session.commandsRun,
      redactions: session.redactions,
      projectContext: session.projectContext,
      skillTags: session.skillTags,
    },
  };
}
