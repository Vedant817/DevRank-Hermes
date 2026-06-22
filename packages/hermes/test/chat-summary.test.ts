import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLocalAiChatSession } from "../src/chat-summary.js";

test("summarizes local AI chat with evidence and inferred skills", () => {
  const summary = summarizeLocalAiChatSession({
    agentName: "Codex",
    commandsRun: ["pnpm test", "pnpm run build"],
    filesTouched: ["apps/web/app/api/github/webhook/route.ts"],
    messages: [
      {
        role: "user",
        content: "Fix the webhook API route and run the validation gate.",
      },
      {
        role: "assistant",
        content: "Implemented the API route fix and verified tests are green.",
      },
    ],
    projectContext: "/repo/devrank-os",
    redactions: ["[REDACTED_SECRET]"],
    skillTags: ["codex", "local-ai"],
    title: "Webhook fix",
    toolCalls: ["apply_patch"],
  });

  assert.equal(summary.confidence, "high");
  assert.match(summary.summary, /Hermes local AI chat summary for Codex/);
  assert.match(summary.summary, /Outcome:/);
  assert.deepEqual(summary.riskFlags, ["sensitive values were redacted"]);
  assert.equal(summary.skillTags.includes("backend-api"), true);
  assert.equal(summary.skillTags.includes("quality-gates"), true);
});

test("marks discussion-only transcripts with lower confidence", () => {
  const summary = summarizeLocalAiChatSession({
    agentName: "Claude Code",
    commandsRun: [],
    filesTouched: [],
    messages: [
      {
        role: "user",
        content: "Brainstorm possible dashboard ideas.",
      },
    ],
    redactions: [],
    skillTags: ["claude", "local-ai"],
    title: "Dashboard brainstorm",
    toolCalls: [],
  });

  assert.equal(summary.confidence, "low");
  assert.match(summary.outcome, /no concrete implementation artifact/i);
});
