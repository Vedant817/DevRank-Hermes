import type { EvidenceItem } from "@repo/shared";
import { summarizeLocalAiChatSession } from "@repo/hermes";
import type { ParsedSession } from "./types.js";

type ConfidenceLabel = "low" | "medium" | "high";

const errorPatterns = [
  "error",
  "failed",
  "failure",
  "exception",
  "stack trace",
  "typeerror",
  "syntaxerror",
  "test failed",
];

const resolutionPatterns = [
  "fixed",
  "resolved",
  "passed",
  "green",
  "implemented",
  "validated",
  "verified",
];

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
  const derivedLearning = deriveLearningMetadata(session, hermesSummary);
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
      agentName: session.agentName,
      prompts: userPrompts.slice(0, 5),
      toolCalls: session.toolCalls,
      filesTouched: session.filesTouched,
      commandsRun: session.commandsRun,
      redactions: session.redactions,
      projectContext: session.projectContext,
      skillTags: hermesSummary.skillTags,
      confidence: hermesSummary.confidence,
      confidenceScore: confidenceScore(hermesSummary.confidence),
      ...derivedLearning,
      hermesSummary,
    },
  };
}

function deriveLearningMetadata(
  session: ParsedSession,
  hermesSummary: ReturnType<typeof summarizeLocalAiChatSession>,
) {
  const transcriptLines = session.messages
    .flatMap((message) => splitSignalLines(message.content))
    .filter((line) => line.length > 0);
  const errorsFaced = uniqueLimited(
    transcriptLines.filter((line) => includesAny(line, errorPatterns)),
    6,
  );
  const howSolved = uniqueLimited(
    [
      ...transcriptLines.filter((line) => includesAny(line, resolutionPatterns)),
      ...session.commandsRun
        .filter((command) => /\b(test|lint|build|typecheck|tsc)\b/i.test(command))
        .map((command) => `Validated with command: ${command}`),
    ],
    6,
  );
  const learningSignals = uniqueLimited([
    ...hermesSummary.evidenceSignals,
    ...session.commandsRun.map((command) => `command:${command}`),
    ...session.filesTouched.map((file) => `file:${file}`),
    ...session.toolCalls.map((tool) => `tool:${tool}`),
  ], 12);
  const skillEvidence = uniqueLimited(
    hermesSummary.skillTags.map((tag) => {
      const proof = learningSignals.find((signal) => signal.toLowerCase().includes(tag.toLowerCase()));

      return proof ? `${tag}: ${proof}` : `${tag}: inferred from transcript evidence`;
    }),
    12,
  );
  const weaknesses = uniqueLimited([
    ...(errorsFaced.length > 0 ? ["Error handling/debugging appeared in the session."] : []),
    ...(session.commandsRun.length === 0 ? ["No validation command was captured."] : []),
    ...(session.filesTouched.length === 0 ? ["No edited file evidence was captured."] : []),
    ...(hermesSummary.confidence === "low" ? ["Low implementation confidence from sparse transcript evidence."] : []),
  ], 6);

  return {
    errorsFaced,
    howSolved,
    learningSignals,
    skillEvidence,
    weaknesses,
    repeatedMistakes: repeatedSignals(errorsFaced),
    strongPatterns: strongPatterns(session, hermesSummary),
  };
}

function splitSignalLines(text: string) {
  return text
    .split(/[\n.]+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function includesAny(value: string, patterns: string[]) {
  const normalized = value.toLowerCase();

  return patterns.some((pattern) => normalized.includes(pattern));
}

function uniqueLimited(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function repeatedSignals(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => `${value} repeated ${count} times`)
    .slice(0, 6);
}

function strongPatterns(
  session: ParsedSession,
  hermesSummary: ReturnType<typeof summarizeLocalAiChatSession>,
) {
  return uniqueLimited([
    ...(session.commandsRun.some((command) => /\b(test|lint|build|typecheck|tsc)\b/i.test(command))
      ? ["Validation command captured."]
      : []),
    ...(session.filesTouched.length > 0 ? ["Concrete file-change evidence captured."] : []),
    ...(session.toolCalls.length > 0 ? ["Tool-assisted implementation evidence captured."] : []),
    ...(hermesSummary.confidence === "high" ? ["High confidence from multiple implementation signals."] : []),
    ...(session.redactions.length > 0 ? ["Sensitive values were redacted before evidence storage."] : []),
  ], 6);
}

function confidenceScore(confidence: ConfidenceLabel) {
  if (confidence === "high") {
    return 0.9;
  }

  if (confidence === "medium") {
    return 0.6;
  }

  return 0.3;
}
