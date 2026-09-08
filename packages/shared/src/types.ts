export const evidenceSources = [
  "local_session",
  "cloud_export",
  "manual_export",
  "workspace_export",
  "github",
  "gitlab",
  "linear",
  "market",
  "skill",
  "manual",
] as const;

export type EvidenceSource = typeof evidenceSources[number];

export interface EvidenceItem {
  id: string;
  source: EvidenceSource;
  title: string;
  summary: string;
  occurredAt: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface ScoreBreakdown {
  label: string;
  score: number;
  weight: number;
  evidenceCount: number;
  explanation: string;
}

export interface ScoreSnapshot {
  overall: number;
  generatedAt: string;
  breakdown: ScoreBreakdown[];
  rubricVersion: string;
}

export interface DailyPlanTask {
  title: string;
  category: DailyPlanTaskCategory;
  minutes: number;
  evidence?: string;
}

export interface DailyPlan {
  date: string;
  targetMinutes: number;
  tasks: DailyPlanTask[];
}

export type DailyPlanTaskCategory =
  | "dsa"
  | "backend"
  | "frontend"
  | "system_design"
  | "testing"
  | "devops"
  | "github"
  | "linear"
  | "ai_agent"
  | "public_proof";

export type WeeklyPlanDay =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export interface WeeklyPlanTask {
  day: WeeklyPlanDay;
  title: string;
  category: DailyPlanTaskCategory;
  minutes: number;
  evidence?: string;
}

export interface WeeklyPlan {
  weekStart: string;
  weeklyGoal: string;
  targetMinutes: number;
  tasks: WeeklyPlanTask[];
  generatedAt: string;
}

export type DsaDifficulty = "easy" | "hard" | "medium";

export interface DsaQuestion {
  slug: string;
  title: string;
  topic: string;
  difficulty: DsaDifficulty;
  url: string;
  patterns: string[];
}
