import { createHash } from "node:crypto";
import type { EvidenceItem } from "@repo/shared";

export interface SkillExtractionOptions {
  generatedAt?: string;
  maxEvidencePerSkill?: number;
  minimumEvidence?: number;
}

interface SkillRule {
  name: string;
  slug: string;
  keywords: string[];
}

const skillRules: SkillRule[] = [
  {
    name: "AI-agent workflow engineering",
    slug: "ai-agent-workflow-engineering",
    keywords: ["ai", "agent", "codex", "claude", "hermes", "openrouter", "ingestion", "redaction"],
  },
  {
    name: "Backend API engineering",
    slug: "backend-api-engineering",
    keywords: ["api", "route", "webhook", "rest", "graphql", "endpoint", "worker"],
  },
  {
    name: "Database and persistence",
    slug: "database-and-persistence",
    keywords: ["postgres", "supabase", "pgvector", "sql", "migration", "memory_items", "database"],
  },
  {
    name: "Testing and quality gates",
    slug: "testing-and-quality-gates",
    keywords: ["test", "unit", "lint", "build", "coverage", "playwright", "vitest", "jest"],
  },
  {
    name: "Cloud automation and delivery",
    slug: "cloud-automation-and-delivery",
    keywords: ["vercel", "cron", "launchd", "daemon", "deploy", "deployment", "ci", "github actions", "workflow run"],
  },
  {
    name: "Project execution and planning",
    slug: "project-execution-and-planning",
    keywords: ["linear", "planner", "slack", "daily plan", "weekly", "priority", "project"],
  },
];

export function extractSkillEvidence(
  evidence: EvidenceItem[],
  options: SkillExtractionOptions = {},
): EvidenceItem[] {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const maxEvidencePerSkill = Math.max(1, options.maxEvidencePerSkill ?? 8);
  const minimumEvidence = Math.max(1, options.minimumEvidence ?? 1);
  const items: EvidenceItem[] = [];

  for (const rule of skillRules) {
    const matches = evidence
      .filter((item) => item.source !== "skill" && evidenceMatchesRule(item, rule))
      .slice(0, maxEvidencePerSkill);

    if (matches.length < minimumEvidence) {
      continue;
    }

    items.push(skillEvidenceItem(rule, matches, generatedAt));
  }

  return items;
}

function evidenceMatchesRule(item: EvidenceItem, rule: SkillRule) {
  const text = evidenceSearchText(item);

  return rule.keywords.some((keyword) => keywordMatchesText(text, keyword));
}

function skillEvidenceItem(rule: SkillRule, matches: EvidenceItem[], generatedAt: string): EvidenceItem {
  const titles = matches.map((item) => item.title).slice(0, 4);
  const evidenceIds = matches.map((item) => item.id);
  const confidence = confidenceForCount(matches.length);

  return {
    id: `skill:${rule.slug}`,
    source: "skill",
    title: `Skill Evidence: ${rule.name}`,
    summary: [
      `Hermes extracted ${rule.name} from ${matches.length} evidence item(s).`,
      `Confidence: ${confidence}.`,
      `Supporting work: ${titles.join("; ")}.`,
    ].join(" "),
    occurredAt: generatedAt,
    metadata: {
      confidence,
      evidenceCount: matches.length,
      evidenceFingerprint: hashEvidenceIds(evidenceIds),
      evidenceIds,
      generatedBy: "hermes-skill-extraction",
      skillName: rule.name,
      skillSlug: rule.slug,
      supportingTitles: titles,
    },
  };
}

function evidenceSearchText(item: EvidenceItem) {
  const metadata = item.metadata ?? {};
  const metadataText = Object.values(metadata)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string | number | boolean => {
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    })
    .join(" ");

  return `${item.title} ${item.summary} ${metadataText}`.toLowerCase();
}

function confidenceForCount(count: number) {
  if (count >= 5) {
    return "high";
  }
  if (count >= 2) {
    return "medium";
  }

  return "low";
}

function keywordMatchesText(text: string, keyword: string) {
  const escaped = keyword
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);

  return pattern.test(text);
}

function hashEvidenceIds(ids: string[]) {
  return createHash("sha256").update(ids.sort().join("|")).digest("hex").slice(0, 16);
}
