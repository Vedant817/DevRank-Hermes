import type { SqlClient } from "./client.js";

const STALE_ISSUE_DAYS = 14;
const MAX_SIGNAL_ROWS = 20;

export type LinearIssueStatusCategory = "blocked" | "canceled" | "done" | "open";

export interface LinearProjectDashboard {
  blockedIssues: LinearDashboardIssue[];
  cycleProgress: LinearProjectProgress[];
  highPriorityIssues: LinearDashboardIssue[];
  issuesMissingGithubProof: LinearDashboardIssue[];
  planningCandidates: LinearDashboardIssue[];
  priorityDistribution: Array<{
    count: number;
    label: string;
    priority: number;
  }>;
  projectGroups: Array<{
    projects: LinearDashboardProject[];
    teamName: string;
    workspaceName: string;
  }>;
  projects: LinearDashboardProject[];
  resumeWorthyCompletedIssues: Array<{
    issue: LinearDashboardIssue;
    proof: LinearGithubProof[];
  }>;
  staleIssues: LinearDashboardIssue[];
  totals: {
    blockedIssues: number;
    doneIssues: number;
    highPriorityIssues: number;
    issues: number;
    missingGithubProof: number;
    openIssues: number;
    projects: number;
    resumeWorthyCompletedIssues: number;
    staleIssues: number;
    unownedIssues: number;
  };
  unownedIssues: LinearDashboardIssue[];
}

export interface LinearDashboardProject {
  blockedIssues: number;
  doneIssues: number;
  highPriorityIssues: number;
  id: string;
  issueCount: number;
  name: string;
  openIssues: number;
  priorityDistribution: Array<{
    count: number;
    label: string;
    priority: number;
  }>;
  progress: number | null;
  staleIssues: number;
  state: string | null;
  teamName: string;
  unownedIssues: number;
  url: string | null;
  workspaceName: string;
}

export interface LinearDashboardIssue {
  assignee: string | null;
  githubProof: LinearGithubProof[];
  hasGithubProof: boolean;
  id: string;
  identifier: string;
  isHighPriority: boolean;
  isStale: boolean;
  priority: number;
  priorityLabel: string;
  projectId: string | null;
  projectName: string;
  state: string | null;
  statusCategory: LinearIssueStatusCategory;
  syncedAt: string;
  teamName: string;
  title: string;
  updatedAt: string | null;
  url: string | null;
  workspaceName: string;
}

export interface LinearProjectProgress {
  projectId: string;
  projectName: string;
  progress: number | null;
  source: "linear_project_progress";
  state: "missing" | "tracked";
}

export interface LinearGithubProof {
  mergedAt: string | null;
  number: number;
  repoFullName: string;
  title: string;
  updatedAt: string | null;
  url: string | null;
}

export interface LinearDashboardProjectRow {
  id: string;
  name: string;
  progress: number | null;
  state: string | null;
  teamName: string | null;
  url: string | null;
  workspaceName: string | null;
}

export interface LinearDashboardIssueRow {
  assignee: string | null;
  id: string;
  identifier: string;
  priority: number | null;
  projectId: string | null;
  projectName: string | null;
  state: string | null;
  syncedAt: string;
  teamName: string | null;
  title: string;
  updatedAt: string | null;
  url: string | null;
  workspaceName: string | null;
}

export interface LinearGithubProofRow {
  mergedAt: string | null;
  number: number;
  repoFullName: string;
  title: string;
  updatedAt: string | null;
  url: string | null;
}

type LinearProjectSqlRow = {
  id: string;
  name: string;
  progress: string | number | null;
  state: string | null;
  team_name: string | null;
  url: string | null;
  workspace_name: string | null;
};

type LinearIssueSqlRow = {
  assignee: string | null;
  id: string;
  identifier: string;
  priority: number | null;
  project_id: string | null;
  project_name: string | null;
  state: string | null;
  synced_at: Date | string;
  team_name: string | null;
  title: string;
  updated_at: Date | string | null;
  url: string | null;
  workspace_name: string | null;
};

type GithubProofSqlRow = {
  merged_at: Date | string | null;
  number: number;
  repo_full_name: string;
  title: string;
  updated_at: Date | string | null;
  url: string | null;
};

export async function getLinearProjectDashboard(
  sql: SqlClient,
  options: { now?: Date } = {},
): Promise<LinearProjectDashboard> {
  const [projectRows, issueRows, proofRows] = await Promise.all([
    sql<LinearProjectSqlRow[]>`
      select
        project.id,
        project.name,
        project.state,
        project.progress,
        project.url,
        team.name as team_name,
        workspace.name as workspace_name
      from linear_projects project
      left join linear_teams team on team.id = project.team_id
      left join linear_workspaces workspace on workspace.id = team.workspace_id
      order by project.synced_at desc, project.name
      limit 500
    `,
    sql<LinearIssueSqlRow[]>`
      select
        issue.id,
        issue.identifier,
        issue.title,
        issue.state,
        issue.priority,
        issue.assignee,
        issue.url,
        issue.updated_at,
        issue.synced_at,
        issue.project_id,
        project.name as project_name,
        coalesce(issue_team.name, project_team.name) as team_name,
        coalesce(issue_workspace.name, project_workspace.name) as workspace_name
      from linear_issues issue
      left join linear_projects project on project.id = issue.project_id
      left join linear_teams issue_team on issue_team.id = issue.team_id
      left join linear_workspaces issue_workspace on issue_workspace.id = issue_team.workspace_id
      left join linear_teams project_team on project_team.id = project.team_id
      left join linear_workspaces project_workspace on project_workspace.id = project_team.workspace_id
      order by coalesce(issue.updated_at, issue.synced_at) desc, issue.identifier
      limit 1000
    `,
    sql<GithubProofSqlRow[]>`
      select
        repo.full_name as repo_full_name,
        pr.number,
        pr.title,
        pr.html_url as url,
        pr.merged_at,
        pr.updated_at
      from github_pull_requests pr
      join github_repos repo on repo.id = pr.repo_id
      order by coalesce(pr.merged_at, pr.updated_at, pr.synced_at) desc
      limit 1000
    `,
  ]);

  return buildLinearProjectDashboard({
    now: options.now ?? new Date(),
    projects: projectRows.map((row) => ({
      id: row.id,
      name: row.name,
      progress: row.progress === null ? null : Number(row.progress),
      state: row.state,
      teamName: row.team_name,
      url: row.url,
      workspaceName: row.workspace_name,
    })),
    issues: issueRows.map((row) => ({
      assignee: row.assignee,
      id: row.id,
      identifier: row.identifier,
      priority: row.priority,
      projectId: row.project_id,
      projectName: row.project_name,
      state: row.state,
      syncedAt: toIso(row.synced_at),
      teamName: row.team_name,
      title: row.title,
      updatedAt: row.updated_at ? toIso(row.updated_at) : null,
      url: row.url,
      workspaceName: row.workspace_name,
    })),
    githubProof: proofRows.map((row) => ({
      mergedAt: row.merged_at ? toIso(row.merged_at) : null,
      number: row.number,
      repoFullName: row.repo_full_name,
      title: row.title,
      updatedAt: row.updated_at ? toIso(row.updated_at) : null,
      url: row.url,
    })),
  });
}

export function buildLinearProjectDashboard(input: {
  githubProof: LinearGithubProofRow[];
  issues: LinearDashboardIssueRow[];
  now: Date;
  projects: LinearDashboardProjectRow[];
}): LinearProjectDashboard {
  const proofByIdentifier = githubProofByIdentifier(input.githubProof, input.issues);
  const issues = input.issues.map((row) => toIssue(row, proofByIdentifier.get(row.identifier) ?? [], input.now));
  const issuesByProject = new Map<string, LinearDashboardIssue[]>();

  for (const issue of issues) {
    issuesByProject.set(issue.projectId ?? "unassigned", [
      ...(issuesByProject.get(issue.projectId ?? "unassigned") ?? []),
      issue,
    ]);
  }

  const projects = input.projects.map((project) => toProject(project, issuesByProject.get(project.id) ?? []));
  const unassignedIssues = issuesByProject.get("unassigned") ?? [];

  if (unassignedIssues.length > 0) {
    projects.push(unassignedProject(unassignedIssues));
  }

  const blockedIssues = issues.filter((issue) => issue.statusCategory === "blocked");
  const doneIssues = issues.filter((issue) => issue.statusCategory === "done");
  const highPriorityIssues = issues.filter((issue) => issue.isHighPriority);
  const staleIssues = issues.filter((issue) => issue.isStale);
  const unownedIssues = issues.filter((issue) => !issue.assignee);
  const issuesMissingGithubProof = issues
    .filter((issue) => issue.statusCategory !== "canceled" && !issue.hasGithubProof)
    .sort(byPlanningPriority);
  const resumeWorthyCompletedIssues = doneIssues
    .filter((issue) => issue.hasGithubProof)
    .map((issue) => ({ issue, proof: issue.githubProof }));

  return {
    blockedIssues: blockedIssues.slice(0, MAX_SIGNAL_ROWS),
    cycleProgress: projects.map((project) => ({
      projectId: project.id,
      projectName: project.name,
      progress: project.progress,
      source: "linear_project_progress",
      state: project.progress === null ? "missing" : "tracked",
    })),
    highPriorityIssues: highPriorityIssues.slice(0, MAX_SIGNAL_ROWS),
    issuesMissingGithubProof: issuesMissingGithubProof.slice(0, MAX_SIGNAL_ROWS),
    planningCandidates: issues
      .filter((issue) => issue.statusCategory === "open" || issue.statusCategory === "blocked")
      .sort(byPlanningPriority)
      .slice(0, 10),
    priorityDistribution: priorityDistribution(issues),
    projectGroups: projectGroups(projects),
    projects,
    resumeWorthyCompletedIssues: resumeWorthyCompletedIssues.slice(0, MAX_SIGNAL_ROWS),
    staleIssues: staleIssues.slice(0, MAX_SIGNAL_ROWS),
    totals: {
      blockedIssues: blockedIssues.length,
      doneIssues: doneIssues.length,
      highPriorityIssues: highPriorityIssues.length,
      issues: issues.length,
      missingGithubProof: issuesMissingGithubProof.length,
      openIssues: issues.filter((issue) => issue.statusCategory === "open").length,
      projects: input.projects.length,
      resumeWorthyCompletedIssues: resumeWorthyCompletedIssues.length,
      staleIssues: staleIssues.length,
      unownedIssues: unownedIssues.length,
    },
    unownedIssues: unownedIssues.slice(0, MAX_SIGNAL_ROWS),
  };
}

function toIssue(
  row: LinearDashboardIssueRow,
  githubProof: LinearGithubProof[],
  now: Date,
): LinearDashboardIssue {
  const state = sanitize(row.state);
  const statusCategory = statusCategoryFor(state);
  const updatedAt = row.updatedAt ?? row.syncedAt;
  const priority = normalizePriority(row.priority);

  return {
    assignee: sanitize(row.assignee) || null,
    githubProof,
    hasGithubProof: githubProof.length > 0,
    id: sanitize(row.id) ?? "",
    identifier: sanitize(row.identifier) ?? "",
    isHighPriority: priority <= 2,
    isStale: statusCategory !== "done" && statusCategory !== "canceled" && daysSince(updatedAt, now) >= STALE_ISSUE_DAYS,
    priority,
    priorityLabel: priorityLabel(priority),
    projectId: row.projectId,
    projectName: sanitize(row.projectName) || "No project",
    state,
    statusCategory,
    syncedAt: row.syncedAt,
    teamName: sanitize(row.teamName) || "Unknown team",
    title: sanitize(row.title) ?? "",
    updatedAt: row.updatedAt,
    url: row.url,
    workspaceName: sanitize(row.workspaceName) || "Unknown workspace",
  };
}

function toProject(row: LinearDashboardProjectRow, issues: LinearDashboardIssue[]): LinearDashboardProject {
  return {
    blockedIssues: issues.filter((issue) => issue.statusCategory === "blocked").length,
    doneIssues: issues.filter((issue) => issue.statusCategory === "done").length,
    highPriorityIssues: issues.filter((issue) => issue.isHighPriority).length,
    id: row.id,
    issueCount: issues.length,
    name: sanitize(row.name) ?? "Unnamed project",
    openIssues: issues.filter((issue) => issue.statusCategory === "open").length,
    priorityDistribution: priorityDistribution(issues),
    progress: row.progress,
    staleIssues: issues.filter((issue) => issue.isStale).length,
    state: sanitize(row.state) || null,
    teamName: sanitize(row.teamName) || "Unknown team",
    unownedIssues: issues.filter((issue) => !issue.assignee).length,
    url: row.url,
    workspaceName: sanitize(row.workspaceName) || "Unknown workspace",
  };
}

function unassignedProject(issues: LinearDashboardIssue[]): LinearDashboardProject {
  return {
    blockedIssues: issues.filter((issue) => issue.statusCategory === "blocked").length,
    doneIssues: issues.filter((issue) => issue.statusCategory === "done").length,
    highPriorityIssues: issues.filter((issue) => issue.isHighPriority).length,
    id: "unassigned",
    issueCount: issues.length,
    name: "No project",
    openIssues: issues.filter((issue) => issue.statusCategory === "open").length,
    priorityDistribution: priorityDistribution(issues),
    progress: null,
    staleIssues: issues.filter((issue) => issue.isStale).length,
    state: null,
    teamName: "Unknown team",
    unownedIssues: issues.filter((issue) => !issue.assignee).length,
    url: null,
    workspaceName: "Unknown workspace",
  };
}

function githubProofByIdentifier(
  proofRows: LinearGithubProofRow[],
  issueRows: LinearDashboardIssueRow[],
): Map<string, LinearGithubProof[]> {
  const identifiers = issueRows.map((issue) => issue.identifier).filter(Boolean);
  const proofs = new Map<string, LinearGithubProof[]>();

  for (const identifier of identifiers) {
    const pattern = new RegExp(`(^|[^A-Z0-9])${escapeRegExp(identifier)}([^A-Z0-9]|$)`, "i");
    const matches = proofRows
      .filter((proof) => pattern.test(proof.title))
      .map((proof) => ({
        mergedAt: proof.mergedAt,
        number: proof.number,
        repoFullName: proof.repoFullName,
        title: proof.title,
        updatedAt: proof.updatedAt,
        url: proof.url,
      }));

    if (matches.length > 0) {
      proofs.set(identifier, matches.slice(0, 5));
    }
  }

  return proofs;
}

function priorityDistribution(issues: LinearDashboardIssue[]) {
  const counts = new Map<number, number>();

  for (const issue of issues) {
    counts.set(issue.priority, (counts.get(issue.priority) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([priority, count]) => ({ priority, count, label: priorityLabel(priority) }))
    .sort((first, second) => first.priority - second.priority);
}

function projectGroups(projects: LinearDashboardProject[]) {
  const groups = new Map<string, LinearDashboardProject[]>();

  for (const project of projects) {
    const key = `${project.workspaceName}:${project.teamName}`;
    groups.set(key, [...(groups.get(key) ?? []), project]);
  }

  return [...groups.entries()]
    .map(([key, projectsInGroup]) => {
      const [workspaceName = "Unknown workspace", teamName = "Unknown team"] = key.split(":");

      return {
        workspaceName,
        teamName,
        projects: projectsInGroup.sort((first, second) => second.issueCount - first.issueCount || first.name.localeCompare(second.name)),
      };
    })
    .sort((first, second) => first.workspaceName.localeCompare(second.workspaceName) || first.teamName.localeCompare(second.teamName));
}

function byPlanningPriority(first: LinearDashboardIssue, second: LinearDashboardIssue): number {
  return Number(second.statusCategory === "blocked") - Number(first.statusCategory === "blocked") ||
    Number(second.isHighPriority) - Number(first.isHighPriority) ||
    Number(second.isStale) - Number(first.isStale) ||
    first.priority - second.priority ||
    first.identifier.localeCompare(second.identifier);
}

function statusCategoryFor(state: string | null): LinearIssueStatusCategory {
  const normalized = state?.toLowerCase() ?? "";

  if (/block|stuck|hold|waiting/.test(normalized)) {
    return "blocked";
  }

  if (/cancel|won.?t|duplicate/.test(normalized)) {
    return "canceled";
  }

  if (/done|complete|closed|resolved|merged|released/.test(normalized)) {
    return "done";
  }

  return "open";
}

function normalizePriority(priority: number | null): number {
  if (priority === null || !Number.isInteger(priority) || priority < 1) {
    return 4;
  }

  return Math.min(priority, 4);
}

function priorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return "urgent";
    case 2:
      return "high";
    case 3:
      return "normal";
    default:
      return "low";
  }
}

function daysSince(value: string, now: Date): number {
  const then = Date.parse(value);

  if (!Number.isFinite(then)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

function sanitize(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s"',;]+/gi, "$1=[REDACTED_SECRET]")
    .replace(/(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
