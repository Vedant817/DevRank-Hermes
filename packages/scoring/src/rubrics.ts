import type { EvidenceItem } from "@repo/shared";

export interface RubricLane {
  label: string;
  weight: number;
  keywords: string[];
}

export const sdeReadinessRubric: RubricLane[] = [
  {
    label: "DSA",
    weight: 0.2,
    keywords: ["dsa", "leetcode", "algorithm", "data structure"],
  },
  {
    label: "Backend/API/System Design",
    weight: 0.2,
    keywords: ["api", "backend", "database", "system design", "endpoint"],
  },
  {
    label: "GitHub Portfolio Quality",
    weight: 0.15,
    keywords: ["github", "pull request", "repository", "readme", "portfolio"],
  },
  {
    label: "Code Quality + Testing",
    weight: 0.15,
    keywords: ["test", "lint", "typecheck", "refactor", "review"],
  },
  {
    label: "DevOps/Cloud",
    weight: 0.1,
    keywords: ["vercel", "supabase", "ci", "deploy", "cron"],
  },
  {
    label: "AI Agent/Automation Skills",
    weight: 0.1,
    keywords: ["codex", "claude", "hermes", "agent", "automation"],
  },
  {
    label: "Communication + Public Proof",
    weight: 0.1,
    keywords: ["resume", "linkedin", "writeup", "docs", "architecture"],
  },
];

export function evidenceText(evidence: EvidenceItem): string {
  return `${evidence.title} ${evidence.summary}`.toLowerCase();
}
