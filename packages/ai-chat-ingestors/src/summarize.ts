import type { EvidenceItem } from "@repo/shared";
import { summarizeLocalAiChatSession } from "@repo/hermes";
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
  const hermesSummary = summarizeLocalAiChatSession({
    agentName: session.agentName,
    commandsRun: session.commandsRun,
    filesTouched: session.filesTouched,
    messages: session.messages,
    projectContext: session.projectContext,
    redactions: session.redactions,
    skillTags: session.skillTags,
    title: session.title,
    toolCalls: session.toolCalls,
  });

  const title = session.title || firstNonEmpty(userPrompts);
  const summaryParts = [
    hermesSummary.summary,
    userPrompts.length === 0 ? "No user prompt was detected." : "",
    assistantMessages.length === 0 ? "No assistant response was detected." : "",
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
      skillTags: hermesSummary.skillTags,
      hermesSummary,
    },
  };
}
