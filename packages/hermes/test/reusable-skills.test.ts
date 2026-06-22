import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildReusableSkillArtifacts,
  writeReusableSkillArtifacts,
} from "../src/reusable-skills.js";
import type { EvidenceItem } from "@repo/shared";

test("builds reusable skill artifacts from source evidence", () => {
  const evidence: EvidenceItem[] = [
    {
      id: "session-1",
      source: "local_session",
      title: "Codex agent workflow",
      summary:
        "Implemented Hermes ingestion and parser tests with token=super-secret and sk-1234567890abcdef.",
      occurredAt: "2026-01-01T00:00:00.000Z",
      metadata: {
        skillTags: ["codex", "tests"],
      },
    },
    {
      id: "session-2",
      source: "github",
      title: "OpenRouter Hermes validation",
      summary: "Validated AI-agent redaction, build, and lint gates for the Hermes package.",
      occurredAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  const artifacts = buildReusableSkillArtifacts(evidence, {
    generatedAt: "2026-01-08T00:00:00.000Z",
  });
  const artifact = artifacts.find((item) => item.slug === "ai-agent-workflow-engineering");

  assert.ok(artifact);
  assert.equal(artifacts.some((item) => item.slug === "cloud-automation-and-delivery"), false);
  assert.equal(artifact.fileName, "skill-ai-agent-workflow-engineering.md");
  assert.deepEqual(artifact.sourceEvidenceIds, ["session-1", "session-2"]);
  assert.match(artifact.markdown, /# AI-agent workflow engineering/);
  assert.match(artifact.markdown, /`session-1`/);
  assert.match(artifact.markdown, /\[REDACTED_SECRET\]/);
  assert.match(artifact.markdown, /\[REDACTED_OPENAI_KEY\]/);
  assert.doesNotMatch(artifact.markdown, /super-secret/);
  assert.doesNotMatch(artifact.markdown, /sk-1234567890abcdef/);
});

test("writes reusable skill artifacts to markdown files", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "devrank-hermes-skills-"));

  try {
    const artifacts = buildReusableSkillArtifacts([
      {
        id: "skill:testing-and-quality-gates",
        source: "skill",
        title: "Skill Evidence: Testing and quality gates",
        summary: "Hermes extracted test, lint, and build quality work from repeated evidence.",
        occurredAt: "2026-01-08T00:00:00.000Z",
        metadata: {
          confidence: "medium",
          evidenceCount: 2,
          evidenceIds: ["session-1"],
          skillName: "Testing and quality gates",
          skillSlug: "testing-and-quality-gates",
          supportingTitles: ["Parser tests", "Build gate"],
        },
      },
    ], {
      generatedAt: "2026-01-08T00:00:00.000Z",
    });

    const result = await writeReusableSkillArtifacts(artifacts, outputDir);
    const written = result.written[0];

    assert.ok(written);
    assert.equal(written.slug, "testing-and-quality-gates");
    assert.equal(written.evidenceCount, 2);
    assert.equal(result.outputDir, outputDir);
    assert.match(await readFile(written.path, "utf8"), /## Reusable Checklist/);
  } finally {
    await rm(outputDir, { force: true, recursive: true });
  }
});
