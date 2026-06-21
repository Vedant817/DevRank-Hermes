export type EvidenceSource =
  | "local_session"
  | "cloud_export"
  | "manual_export"
  | "workspace_export"
  | "github"
  | "linear"
  | "market"
  | "manual";

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
}

export interface DailyPlanTask {
  title: string;
  category:
    | "dsa"
    | "backend"
    | "system_design"
    | "github"
    | "linear"
    | "ai_agent"
    | "public_proof";
  minutes: number;
  evidence?: string;
}

export interface DailyPlan {
  date: string;
  targetMinutes: number;
  tasks: DailyPlanTask[];
}
