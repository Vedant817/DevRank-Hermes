import test from "node:test";
import assert from "node:assert/strict";
import { extractSkillEvidence } from "../src/skill-extraction.js";
import type { EvidenceItem } from "@repo/shared";

test("extracts stable skill evidence from redacted source evidence", () => {
  const evidence: EvidenceItem[] = [
    {
      id: "session-1",
      source: "local_session",
      title: "Adapter-based local AI ingestion",
      summary: "Implemented Codex and Claude agent ingestion with redaction and parser tests.",
      occurredAt: "2026-01-01T00:00:00.000Z",
      metadata: {
        skillTags: ["codex", "local-ai"],
      },
    },
    {
      id: "session-2",
      source: "github",
      title: "Webhook API route",
      summary: "Built API route and webhook signature verification with unit tests.",
      occurredAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  const skills = extractSkillEvidence(evidence, {
    generatedAt: "2026-01-08T00:00:00.000Z",
  });

  assert.equal(skills.some((item) => item.id === "skill:ai-agent-workflow-engineering"), true);
  assert.equal(skills.some((item) => item.id === "skill:testing-and-quality-gates"), true);
  assert.equal(skills.every((item) => item.source === "skill"), true);
  assert.equal(skills.every((item) => item.occurredAt === "2026-01-08T00:00:00.000Z"), true);
});

test("does not use prior skill rows as source evidence", () => {
  const skills = extractSkillEvidence([
    {
      id: "skill:testing-and-quality-gates",
      source: "skill",
      title: "Skill Evidence: Testing",
      summary: "Tests and build quality.",
      occurredAt: "2026-01-01T00:00:00.000Z",
    },
  ]);

  assert.deepEqual(skills, []);
});

test("does not match skill keywords inside unrelated words", () => {
  const skills = extractSkillEvidence([
    {
      id: "session-1",
      source: "local_session",
      title: "OpenRouter provider setup",
      summary: "Configured model provider redaction without changing HTTP handlers.",
      occurredAt: "2026-01-01T00:00:00.000Z",
    },
  ]);

  assert.equal(skills.some((item) => item.id === "skill:backend-api-engineering"), false);
});
