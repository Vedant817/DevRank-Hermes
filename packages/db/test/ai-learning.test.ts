import assert from "node:assert/strict";
import test from "node:test";
import { buildAiAgentLearningDashboard } from "../src/ai-learning.js";

test("builds AI agent learning dashboard from persisted evidence metadata", () => {
  const dashboard = buildAiAgentLearningDashboard({
    memoryRows: [
      {
        createdAt: "2026-06-23T08:00:00.000Z",
        metadata: {
          agentName: "Codex",
          confidenceScore: 0.9,
          prompts: ["Fix the stale score snapshot issue."],
          skillTags: ["quality-gates", "backend-api"],
          strongPatterns: ["Validation command captured."],
          howSolved: ["Validated with command: pnpm test"],
          errorsFaced: ["TypeError from stale score snapshots"],
        },
        source: "local_session",
        sourceId: "session-1",
        summary: "Implemented and validated the fix.",
        title: "Score snapshot fix",
      },
      {
        createdAt: "2026-06-22T08:00:00.000Z",
        metadata: {
          agentName: "Claude Code",
          confidenceScore: 0.3,
          prompts: ["Brainstorm dashboard ideas."],
          skillTags: ["planning"],
          weaknesses: ["No validation command was captured."],
        },
        source: "manual_export",
        sourceId: "manual-1",
        summary: "Discussion-only planning note.",
        title: "Dashboard brainstorm",
      },
    ],
    sessionRows: [
      {
        agentName: "Codex",
        messages: 4,
        rawStored: true,
        sourceId: "session-1",
        sourceType: "local_session",
        startedAt: "2026-06-23T07:59:00.000Z",
      },
    ],
    skillRows: [
      {
        createdAt: "2026-06-23T09:00:00.000Z",
        metadata: {
          skillTags: ["quality-gates"],
        },
        summary: "Reusable validation checklist.",
        title: "quality gate skill",
      },
    ],
  });

  assert.equal(dashboard.totals.evidenceItems, 2);
  assert.equal(dashboard.totals.reusableSkills, 1);
  assert.deepEqual(dashboard.agentUsage.map((agent) => agent.agentName), ["Codex", "Claude Code"]);
  assert.equal(dashboard.agentUsage[0]?.messages, 4);
  assert.deepEqual(dashboard.sourceBreakdown.map((source) => source.source), ["local_session", "manual_export"]);
  assert.equal(dashboard.taskTypes[0]?.tag, "quality-gates");
  assert.match(dashboard.aiDependencyWarnings[0]?.signal ?? "", /validation command/i);
  assert.match(dashboard.improvementSignals[0]?.signal ?? "", /Validation command/);
  assert.match(dashboard.repeatedErrors[0]?.signal ?? "", /TypeError/);
  assert.equal(dashboard.bestPrompts[0]?.prompt, "Fix the stale score snapshot issue.");
  assert.equal(dashboard.reusableSkills[0]?.title, "quality gate skill");
});
