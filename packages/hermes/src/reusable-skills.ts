import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvidenceItem } from "@repo/shared";
import { extractSkillEvidence, type SkillExtractionOptions } from "./skill-extraction.js";

export type ReusableSkillConfidence = "low" | "medium" | "high";

export interface ReusableSkillOptions extends SkillExtractionOptions {
  maxSourceEvidence?: number;
}

export interface ReusableSkillArtifact {
  slug: string;
  title: string;
  fileName: string;
  markdown: string;
  confidence: ReusableSkillConfidence;
  evidenceCount: number;
  sourceEvidenceIds: string[];
  generatedAt: string;
}

export interface WriteReusableSkillArtifactsResult {
  outputDir: string;
  written: Array<{
    confidence: ReusableSkillConfidence;
    evidenceCount: number;
    path: string;
    slug: string;
    title: string;
  }>;
}

const confidenceValues = new Set<ReusableSkillConfidence>(["low", "medium", "high"]);

const sensitivePatterns: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]"],
  [/xox[baprs]-[A-Za-z0-9-]+/g, "[REDACTED_SLACK_TOKEN]"],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/postgres(?:ql)?:\/\/[^\s"'`)]+/gi, "[REDACTED_DATABASE_URL]"],
  [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, "[REDACTED_EMAIL]"],
  [/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?(?!\[REDACTED_)[^"'\s)]+/gi, "$1=[REDACTED_SECRET]"],
];

export function buildReusableSkillArtifacts(
  evidence: EvidenceItem[],
  options: ReusableSkillOptions = {},
): ReusableSkillArtifact[] {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const maxSourceEvidence = Math.max(1, options.maxSourceEvidence ?? 6);
  const sourceEvidence = evidence.filter((item) => item.source !== "skill");
  const sourceEvidenceById = new Map(sourceEvidence.map((item) => [item.id, item]));
  const skillEvidenceBySlug = new Map<string, EvidenceItem>();

  for (const item of extractSkillEvidence(sourceEvidence, { ...options, generatedAt })) {
    skillEvidenceBySlug.set(skillSlug(item), item);
  }

  for (const item of evidence.filter((candidate) => candidate.source === "skill")) {
    skillEvidenceBySlug.set(skillSlug(item), item);
  }

  return [...skillEvidenceBySlug.values()]
    .map((skillEvidence) => {
      const sourceEvidenceIds = metadataStringArray(skillEvidence, "evidenceIds");
      const supportingEvidence = sourceEvidenceIds
        .map((id) => sourceEvidenceById.get(id))
        .filter((item): item is EvidenceItem => item !== undefined)
        .slice(0, maxSourceEvidence);
      const slug = skillSlug(skillEvidence);
      const title = skillTitle(skillEvidence);
      const confidence = skillConfidence(skillEvidence);
      const evidenceCount = skillEvidenceCount(skillEvidence, sourceEvidenceIds, supportingEvidence);

      return {
        slug,
        title,
        fileName: `skill-${slug}.md`,
        markdown: renderReusableSkillMarkdown({
          confidence,
          evidenceCount,
          generatedAt,
          skillEvidence,
          slug,
          sourceEvidenceIds,
          supportingEvidence,
          title,
        }),
        confidence,
        evidenceCount,
        sourceEvidenceIds,
        generatedAt,
      };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function writeReusableSkillArtifacts(
  artifacts: ReusableSkillArtifact[],
  outputDir: string,
): Promise<WriteReusableSkillArtifactsResult> {
  await mkdir(outputDir, { recursive: true });

  const written = [];

  for (const artifact of artifacts) {
    const artifactPath = join(outputDir, artifact.fileName);

    await writeFile(artifactPath, artifact.markdown, "utf8");
    written.push({
      confidence: artifact.confidence,
      evidenceCount: artifact.evidenceCount,
      path: artifactPath,
      slug: artifact.slug,
      title: artifact.title,
    });
  }

  return {
    outputDir,
    written,
  };
}

function renderReusableSkillMarkdown(input: {
  confidence: ReusableSkillConfidence;
  evidenceCount: number;
  generatedAt: string;
  skillEvidence: EvidenceItem;
  slug: string;
  sourceEvidenceIds: string[];
  supportingEvidence: EvidenceItem[];
  title: string;
}) {
  const sourceLines = renderSourceEvidence(input.supportingEvidence, input.skillEvidence);

  return [
    `# ${sanitizeText(input.title)}`,
    "",
    "## Metadata",
    "",
    `- Slug: \`${input.slug}\``,
    `- Generated at: ${input.generatedAt}`,
    `- Confidence: ${input.confidence}`,
    `- Evidence count: ${input.evidenceCount}`,
    input.sourceEvidenceIds.length > 0
      ? `- Source evidence IDs: ${input.sourceEvidenceIds.map((id) => `\`${sanitizeText(id)}\``).join(", ")}`
      : "- Source evidence IDs: none captured",
    "",
    "## Purpose",
    "",
    sanitizeText(input.skillEvidence.summary),
    "",
    "## Reusable Checklist",
    "",
    "- Start from source evidence, not memory or generic claims.",
    "- Confirm the repo, files, commands, and validation gate before repeating the pattern.",
    "- Apply the pattern only when the current task has matching evidence and constraints.",
    "- Capture the outcome, failures, and validation result as new evidence after use.",
    "",
    "## Verification",
    "",
    "- Cite at least one source evidence ID when this skill is reused.",
    "- Keep secrets, tokens, private client data, and raw transcripts out of the skill document.",
    "- Prefer deterministic checks such as tests, lint, builds, or persisted artifacts over subjective claims.",
    "",
    "## Source Evidence",
    "",
    sourceLines.join("\n"),
    "",
  ].join("\n");
}

function renderSourceEvidence(supportingEvidence: EvidenceItem[], skillEvidence: EvidenceItem) {
  if (supportingEvidence.length > 0) {
    return supportingEvidence.map((item) => {
      const url = item.url ? ` ${sanitizeText(item.url)}` : "";

      return [
        `- \`${sanitizeText(item.id)}\` (${item.source}, ${sanitizeText(item.occurredAt)}): ${sanitizeText(item.title)}.${url}`,
        `  Summary: ${sanitizeText(item.summary)}`,
      ].join("\n");
    });
  }

  const supportingTitles = metadataStringArray(skillEvidence, "supportingTitles");

  if (supportingTitles.length > 0) {
    return supportingTitles.map((title) => `- ${sanitizeText(title)}`);
  }

  return [`- \`${sanitizeText(skillEvidence.id)}\`: ${sanitizeText(skillEvidence.summary)}`];
}

function skillSlug(item: EvidenceItem) {
  const metadataSlug = metadataString(item, "skillSlug");

  if (metadataSlug) {
    return slugify(metadataSlug);
  }

  if (item.id.startsWith("skill:")) {
    return slugify(item.id.slice("skill:".length));
  }

  return slugify(item.title.replace(/^Skill Evidence:\s*/i, ""));
}

function skillTitle(item: EvidenceItem) {
  return metadataString(item, "skillName") ?? item.title.replace(/^Skill Evidence:\s*/i, "");
}

function skillConfidence(item: EvidenceItem): ReusableSkillConfidence {
  const confidence = metadataString(item, "confidence");

  return confidence && confidenceValues.has(confidence as ReusableSkillConfidence)
    ? confidence as ReusableSkillConfidence
    : "low";
}

function skillEvidenceCount(item: EvidenceItem, sourceEvidenceIds: string[], supportingEvidence: EvidenceItem[]) {
  const count = item.metadata?.evidenceCount;

  if (typeof count === "number" && Number.isFinite(count)) {
    return Math.max(0, Math.trunc(count));
  }

  if (sourceEvidenceIds.length > 0) {
    return sourceEvidenceIds.length;
  }

  return supportingEvidence.length;
}

function metadataString(item: EvidenceItem, key: string) {
  const value = item.metadata?.[key];

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function metadataStringArray(item: EvidenceItem, key: string) {
  const value = item.metadata?.[key];

  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "reusable-skill";
}

function sanitizeText(value: string) {
  return sensitivePatterns.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value.replace(/\s+/g, " ").trim(),
  );
}
