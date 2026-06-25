import type { EvidenceItem } from "@repo/shared";

export interface RubricLane {
  label: string;
  weight: number;
  keywords: string[];
}

export const sdeReadinessRubricVersion = "sde-readiness-v2";

export const sdeReadinessRubric: RubricLane[] = [
  {
    label: "DSA",
    weight: 0.2,
    keywords: ["dsa", "leetcode", "algorithm", "algorithms", "data structure", "data structures"],
  },
  {
    label: "Backend/API",
    weight: 0.15,
    keywords: ["api", "backend", "database", "endpoint", "server", "service"],
  },
  {
    label: "Frontend/UI",
    weight: 0.05,
    keywords: ["frontend", "ui", "ux", "react", "next.js", "nextjs", "css", "accessibility"],
  },
  {
    label: "System Design",
    weight: 0.1,
    keywords: ["system design", "architecture", "scalability", "distributed", "rate limiter", "queue"],
  },
  {
    label: "GitHub Portfolio Quality",
    weight: 0.15,
    keywords: ["github", "pull request", "repository", "readme", "portfolio"],
  },
  {
    label: "Code Quality + Testing",
    weight: 0.15,
    keywords: ["test", "tests", "testing", "qa", "lint", "typecheck", "refactor", "review"],
  },
  {
    label: "DevOps/Cloud",
    weight: 0.08,
    keywords: ["vercel", "supabase", "ci", "deploy", "deployment", "cron"],
  },
  {
    label: "AI Agent/Automation Skills",
    weight: 0.07,
    keywords: ["codex", "claude", "hermes", "agent", "automation"],
  },
  {
    label: "Communication + Public Proof",
    weight: 0.05,
    keywords: ["resume", "linkedin", "writeup", "docs", "architecture"],
  },
];

export function evidenceText(evidence: EvidenceItem): string {
  return `${evidence.title} ${evidence.summary}`.toLowerCase();
}
