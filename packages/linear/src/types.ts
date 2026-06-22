export interface LinearProjectSummary {
  id: string;
  name: string;
  state: string | null;
  progress: number | null;
  url: string | null;
  teamName: string | null;
}

export interface LinearIssueSummary {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string;
  state: string | null;
  assignee: string | null;
  projectId: string | null;
}

export interface LinearBackfillResult {
  projects: LinearProjectSummary[];
  issues: LinearIssueSummary[];
}

export interface LinearWebhookResult {
  action?: string;
  type?: string;
  organizationId?: string;
  url?: string;
}

export interface LinearWebhookIngestion {
  backfill: LinearBackfillResult;
  summary: LinearWebhookResult;
}
