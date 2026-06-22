import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSession } from "../src/summarize.js";
import type { ParsedSession } from "../src/types.js";

test("uses Hermes local AI chat summary for evidence output", () => {
  const session: ParsedSession = {
    id: "session-1",
    agentName: "Codex",
    commandsRun: ["pnpm test"],
    filesTouched: ["packages/hermes/src/chat-summary.ts"],
    messages: [
      {
        role: "user",
        content: "Implement a local AI chat summarizer.",
      },
      {
        role: "assistant",
        content: "Implemented the summarizer and verified tests passed.",
      },
    ],
    redactions: ["[REDACTED_SECRET]"],
    skillTags: ["codex", "local-ai"],
    source: "local_session",
    title: "Summarizer work",
    toolCalls: ["apply_patch"],
  };

  const evidence = summarizeSession(session);

  assert.match(evidence.summary, /Hermes local AI chat summary for Codex/);
  assert.match(evidence.summary, /Evidence:/);
  assert.equal(evidence.metadata?.hermesSummary && typeof evidence.metadata.hermesSummary === "object", true);
  assert.deepEqual(evidence.metadata?.redactions, ["[REDACTED_SECRET]"]);
});
