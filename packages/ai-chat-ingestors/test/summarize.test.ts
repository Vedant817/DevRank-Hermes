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

test("extracts deterministic learning metadata from implementation sessions", () => {
  const session: ParsedSession = {
    id: "session-2",
    agentName: "Codex",
    commandsRun: ["pnpm test", "pnpm run build"],
    filesTouched: ["apps/web/app/api/scores/recompute/route.ts"],
    messages: [
      {
        role: "user",
        content: "Fix the TypeError from stale score snapshots.",
      },
      {
        role: "assistant",
        content: "Implemented the stale snapshot refresh and verified the tests passed.",
      },
      {
        role: "assistant",
        content: "The TypeError was resolved after the route used the current scoring rubric.",
      },
    ],
    projectContext: "/repo/devrank-os",
    redactions: [],
    skillTags: ["codex", "local-ai"],
    source: "local_session",
    title: "Score snapshot fix",
    toolCalls: ["apply_patch"],
  };

  const evidence = summarizeSession(session);

  assert.deepEqual(evidence.metadata?.errorsFaced, [
    "Fix the TypeError from stale score snapshots",
    "The TypeError was resolved after the route used the current scoring rubric",
  ]);
  assert.equal(Array.isArray(evidence.metadata?.howSolved), true);
  assert.match(String(evidence.metadata?.howSolved), /tests passed/);
  assert.match(String(evidence.metadata?.howSolved), /pnpm test/);
  assert.equal(evidence.metadata?.confidence, "high");
  assert.equal(evidence.metadata?.confidenceScore, 0.9);
  assert.equal(Array.isArray(evidence.metadata?.learningSignals), true);
  assert.equal(Array.isArray(evidence.metadata?.skillEvidence), true);
  assert.equal(Array.isArray(evidence.metadata?.weaknesses), true);
  assert.equal(Array.isArray(evidence.metadata?.strongPatterns), true);
  assert.match(String(evidence.metadata?.strongPatterns), /Validation command captured/);
});
