import { redactPII } from "@repo/guardrails";
import type { ParsedSession } from "./types.js";

export function redactSecrets(text: string): {
  text: string;
  redactions: string[];
} {
  const result = redactPII(text);

  return {
    text: result.redacted,
    redactions: result.detections.map((d) => d.type),
  };
}

export function applyRedactionsToSession(session: ParsedSession): ParsedSession {
  if (session.redactions.length > 0) {
    return session;
  }

  const allRedactions = new Set<string>();

  const redactedMessages = session.messages.map((msg) => {
    const result = redactSecrets(msg.content);
    for (const r of result.redactions) {
      allRedactions.add(r);
    }
    return { ...msg, content: result.text };
  });

  return {
    ...session,
    messages: redactedMessages,
    redactions: Array.from(allRedactions),
  };
}
