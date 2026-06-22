export type HermesChatRole = "user" | "assistant" | "tool" | "system";

export interface HermesChatMessage {
  role: HermesChatRole;
  content: string;
}

export interface HermesLocalChatSession {
  agentName: string;
  commandsRun: string[];
  filesTouched: string[];
  messages: HermesChatMessage[];
  projectContext?: string;
  redactions: string[];
  skillTags: string[];
  title: string;
  toolCalls: string[];
}

export interface HermesLocalChatSummary {
  confidence: "low" | "medium" | "high";
  evidenceSignals: string[];
  outcome: string;
  riskFlags: string[];
  skillTags: string[];
  summary: string;
  title: string;
}

const errorPatterns = [
  "error",
  "failed",
  "failure",
  "exception",
  "stack trace",
  "typeerror",
  "syntaxerror",
  "lint",
  "test failed",
];

const resolutionPatterns = [
  "fixed",
  "resolved",
  "passed",
  "green",
  "implemented",
  "committed",
  "validated",
  "verified",
];

export function summarizeLocalAiChatSession(session: HermesLocalChatSession): HermesLocalChatSummary {
  const userIntent = firstMessageByRole(session, "user") ?? session.title;
  const assistantOutcome = lastMessageByRole(session, "assistant") ?? "No assistant outcome was captured.";
  const evidenceSignals = buildEvidenceSignals(session);
  const riskFlags = buildRiskFlags(session);
  const outcome = inferOutcome(session, assistantOutcome);
  const confidence = confidenceForSession(session);
  const skillTags = [...new Set([
    ...session.skillTags,
    ...inferSkillTags(session),
  ])].sort();

  return {
    confidence,
    evidenceSignals,
    outcome,
    riskFlags,
    skillTags,
    title: session.title || trimText(userIntent, 80),
    summary: [
      `Hermes local AI chat summary for ${session.agentName}.`,
      `Intent: ${trimText(userIntent, 220)}`,
      `Outcome: ${trimText(outcome, 220)}`,
      evidenceSignals.length > 0 ? `Evidence: ${evidenceSignals.join("; ")}.` : "Evidence: no concrete artifacts captured.",
      riskFlags.length > 0 ? `Risks: ${riskFlags.join("; ")}.` : "Risks: none detected from the redacted transcript.",
      `Confidence: ${confidence}.`,
    ].join(" "),
  };
}

function buildEvidenceSignals(session: HermesLocalChatSession) {
  const signals = [];

  if (session.commandsRun.length > 0) {
    signals.push(`commands ${session.commandsRun.slice(0, 4).join(", ")}`);
  }

  if (session.filesTouched.length > 0) {
    signals.push(`files ${session.filesTouched.slice(0, 4).join(", ")}`);
  }

  if (session.toolCalls.length > 0) {
    signals.push(`tools ${session.toolCalls.slice(0, 4).join(", ")}`);
  }

  if (session.projectContext) {
    signals.push(`project ${trimText(session.projectContext, 120)}`);
  }

  if (session.redactions.length > 0) {
    signals.push(`redactions ${[...new Set(session.redactions)].join(", ")}`);
  }

  return signals;
}

function buildRiskFlags(session: HermesLocalChatSession) {
  const transcript = session.messages.map((message) => message.content).join("\n").toLowerCase();
  const risks = [];

  if (errorPatterns.some((pattern) => transcript.includes(pattern))) {
    risks.push("error-handling evidence present");
  }

  if (session.redactions.length > 0) {
    risks.push("sensitive values were redacted");
  }

  if (session.messages.length === 0) {
    risks.push("empty transcript");
  }

  return risks;
}

function inferOutcome(session: HermesLocalChatSession, assistantOutcome: string) {
  const transcript = session.messages.map((message) => message.content).join("\n").toLowerCase();
  const resolved = resolutionPatterns.some((pattern) => transcript.includes(pattern));

  if (resolved) {
    return assistantOutcome;
  }

  if (session.commandsRun.length > 0 || session.filesTouched.length > 0 || session.toolCalls.length > 0) {
    return assistantOutcome;
  }

  return "The transcript captures discussion, but no concrete implementation artifact was detected.";
}

function inferSkillTags(session: HermesLocalChatSession) {
  const text = [
    session.title,
    session.projectContext ?? "",
    session.commandsRun.join(" "),
    session.filesTouched.join(" "),
    session.toolCalls.join(" "),
    session.messages.map((message) => message.content).join(" "),
  ].join(" ").toLowerCase();
  const tags = [];

  if (text.includes("test") || text.includes("lint") || text.includes("build")) {
    tags.push("quality-gates");
  }
  if (text.includes("api") || text.includes("route") || text.includes("webhook")) {
    tags.push("backend-api");
  }
  if (text.includes("database") || text.includes("postgres") || text.includes("supabase")) {
    tags.push("database");
  }
  if (text.includes("daemon") || text.includes("launchd") || text.includes("cron")) {
    tags.push("automation");
  }

  return tags;
}

function confidenceForSession(session: HermesLocalChatSession): "low" | "medium" | "high" {
  const signalCount =
    session.commandsRun.length +
    session.filesTouched.length +
    session.toolCalls.length +
    (session.projectContext ? 1 : 0);

  if (signalCount >= 4 && session.messages.length >= 2) {
    return "high";
  }
  if (signalCount >= 1 || session.messages.length >= 2) {
    return "medium";
  }

  return "low";
}

function firstMessageByRole(session: HermesLocalChatSession, role: HermesChatRole) {
  return session.messages.find((message) => message.role === role)?.content;
}

function lastMessageByRole(session: HermesLocalChatSession, role: HermesChatRole) {
  return [...session.messages].reverse().find((message) => message.role === role)?.content;
}

function trimText(value: string, limit: number) {
  const trimmed = value.replace(/\s+/g, " ").trim();

  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}...` : trimmed;
}
