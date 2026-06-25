import type { SqlClient } from "./client.js";

const STALE_ISSUE_DAYS = 14;
const MAX_SIGNAL_ROWS = 20;

export type LinearIssueStatusCategory = "blocked" | "canceled" | "done" | "open";

export interface LinearProjectDashboardFilters {
  priority?: number;
  projectId?: string;
  status?: LinearIssueStatusCategory;
  teamName?: string;
  workspaceName?: string;
}

export interface LinearProjectDashboardFilterOptions {
  priorities: Array<{
    count: number;
    label: string;
    value: number;
  }>;
  projects: Array<{
    id: string;
    name: string;
    teamName: string;
    workspaceName: string;
  }>;
  statuses: Array<{
    count: number;
    label: string;
    value: LinearIssueStatusCategory;
  }>;
  teams: string[];
  workspaces: string[];
}

export interface LinearProjectDashboard {
  activeFilters: LinearProjectDashboardFilters;
  blockedIssues: LinearDashboardIssue[];
  cycleProgress: LinearProjectProgress[];
  filterOptions: LinearProjectDashboardFilterOptions;
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
  totals: LinearProjectDashboardTotals;
  unownedIssues: LinearDashboardIssue[];
}

export interface LinearProjectDashboardTotals {
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
  total_projects: string | number;
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
  total_blocked_issues: string | number;
  total_done_issues: string | number;
  total_high_priority_issues: string | number;
  total_issues: string | number;
  total_missing_github_proof: string | number;
  total_open_issues: string | number;
  total_resume_worthy_completed_issues: string | number;
  total_stale_issues: string | number;
  total_unowned_issues: string | number;
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

type LinearFilterCountSqlRow = {
  count: string | number;
  value: string | number;
};

type LinearFilterProjectSqlRow = {
  id: string;
  name: string;
  team_name: string | null;
  workspace_name: string | null;
};

type LinearFilterScopeSqlRow = {
  team_name: string | null;
  workspace_name: string | null;
};

export async function getLinearProjectDashboard(
  sql: SqlClient,
  options: { filters?: LinearProjectDashboardFilters; now?: Date } = {},
): Promise<LinearProjectDashboard> {
  const filters = normalizeDashboardFilters(options.filters);
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - STALE_ISSUE_DAYS * 86_400_000).toISOString();
  const workspaceName = filters.workspaceName ?? null;
  const teamName = filters.teamName ?? null;
  const projectId = filters.projectId ?? null;
  const status = filters.status ?? null;
  const priority = filters.priority ?? null;
  const hasIssueScopedFilters = status !== null || priority !== null;
  const [
    projectRows,
    issueRows,
    proofRows,
    filterProjectRows,
    filterPriorityRows,
    filterStatusRows,
    filterScopeRows,
  ] = await Promise.all([
    sql<LinearProjectSqlRow[]>`
      select
        project.id,
        project.name,
        project.state,
        project.progress,
        project.url,
        team.name as team_name,
        workspace.name as workspace_name,
        count(*) over() as total_projects
      from linear_projects project
      left join linear_teams team on team.id = project.team_id
      left join linear_workspaces workspace on workspace.id = team.workspace_id
      where (
        ${workspaceName}::text is null
        or coalesce(workspace.name, 'Unknown workspace') = ${workspaceName}
      )
        and (
          ${teamName}::text is null
          or coalesce(team.name, 'Unknown team') = ${teamName}
        )
        and (${projectId}::text is null or project.id = ${projectId})
        and (
          ${hasIssueScopedFilters} = false
          or exists (
            select 1
            from linear_issues issue
            where issue.project_id = project.id
              and (
                ${status}::text is null
                or case
                  when coalesce(issue.state, '') ~* '(block|stuck|hold|waiting)' then 'blocked'
                  when coalesce(issue.state, '') ~* '(cancel|won.?t|duplicate)' then 'canceled'
                  when coalesce(issue.state, '') ~* '(done|complete|closed|resolved|merged|released)' then 'done'
                  else 'open'
                end = ${status}
              )
              and (
                ${priority}::integer is null
                or case
                  when issue.priority between 1 and 4 then issue.priority
                  else 4
                end = ${priority}
              )
          )
        )
      order by project.synced_at desc, project.name
      limit 500
    `,
    sql<LinearIssueSqlRow[]>`
      with classified_issues as (
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
          coalesce(issue_workspace.name, project_workspace.name) as workspace_name,
          case
            when coalesce(issue.state, '') ~* '(block|stuck|hold|waiting)' then 'blocked'
            when coalesce(issue.state, '') ~* '(cancel|won.?t|duplicate)' then 'canceled'
            when coalesce(issue.state, '') ~* '(done|complete|closed|resolved|merged|released)' then 'done'
            else 'open'
          end as status_category,
          case
            when issue.priority between 1 and 4 then issue.priority
            else 4
          end as normalized_priority,
          (
            case
              when coalesce(issue.state, '') ~* '(done|complete|closed|resolved|merged|released|cancel|won.?t|duplicate)'
                then false
              else coalesce(issue.updated_at, issue.synced_at) <= ${staleBefore}::timestamptz
            end
          ) as is_stale,
          exists (
            select 1
            from github_pull_requests proof_pr
            where (
              ' ' || regexp_replace(upper(proof_pr.title), '[^A-Z0-9]+', ' ', 'g') || ' '
            ) like (
              '% ' || regexp_replace(upper(issue.identifier), '[^A-Z0-9]+', ' ', 'g') || ' %'
            )
          ) as has_github_proof
        from linear_issues issue
        left join linear_projects project on project.id = issue.project_id
        left join linear_teams issue_team on issue_team.id = issue.team_id
        left join linear_workspaces issue_workspace on issue_workspace.id = issue_team.workspace_id
        left join linear_teams project_team on project_team.id = project.team_id
        left join linear_workspaces project_workspace on project_workspace.id = project_team.workspace_id
      ),
      filtered_issues as (
        select *
        from classified_issues
        where (
          ${workspaceName}::text is null
          or coalesce(workspace_name, 'Unknown workspace') = ${workspaceName}
        )
          and (
            ${teamName}::text is null
            or coalesce(team_name, 'Unknown team') = ${teamName}
          )
          and (${projectId}::text is null or project_id = ${projectId})
          and (${status}::text is null or status_category = ${status})
          and (${priority}::integer is null or normalized_priority = ${priority})
      )
      select
        filtered_issues.*,
        count(*) over() as total_issues,
        count(*) filter (where status_category = 'blocked') over() as total_blocked_issues,
        count(*) filter (where status_category = 'done') over() as total_done_issues,
        count(*) filter (where status_category = 'open') over() as total_open_issues,
        count(*) filter (where normalized_priority <= 2) over() as total_high_priority_issues,
        count(*) filter (where is_stale) over() as total_stale_issues,
        count(*) filter (where nullif(trim(assignee), '') is null) over() as total_unowned_issues,
        count(*) filter (
          where status_category <> 'canceled' and has_github_proof = false
        ) over() as total_missing_github_proof,
        count(*) filter (
          where status_category = 'done' and has_github_proof = true
        ) over() as total_resume_worthy_completed_issues
      from filtered_issues
      order by coalesce(updated_at, synced_at) desc, identifier
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
    sql<LinearFilterProjectSqlRow[]>`
      select
        project.id,
        project.name,
        team.name as team_name,
        workspace.name as workspace_name
      from linear_projects project
      left join linear_teams team on team.id = project.team_id
      left join linear_workspaces workspace on workspace.id = team.workspace_id
      order by workspace.name nulls last, team.name nulls last, project.name
    `,
    sql<LinearFilterCountSqlRow[]>`
      select
        case
          when issue.priority between 1 and 4 then issue.priority
          else 4
        end as value,
        count(*) as count
      from linear_issues issue
      group by 1
      order by 1
    `,
    sql<LinearFilterCountSqlRow[]>`
      select
        case
          when coalesce(issue.state, '') ~* '(block|stuck|hold|waiting)' then 'blocked'
          when coalesce(issue.state, '') ~* '(cancel|won.?t|duplicate)' then 'canceled'
          when coalesce(issue.state, '') ~* '(done|complete|closed|resolved|merged|released)' then 'done'
          else 'open'
        end as value,
        count(*) as count
      from linear_issues issue
      group by 1
      order by 1
    `,
    sql<LinearFilterScopeSqlRow[]>`
      select distinct scope.team_name, scope.workspace_name
      from (
        select
          team.name as team_name,
          workspace.name as workspace_name
        from linear_projects project
        left join linear_teams team on team.id = project.team_id
        left join linear_workspaces workspace on workspace.id = team.workspace_id

        union all

        select
          coalesce(issue_team.name, project_team.name) as team_name,
          coalesce(issue_workspace.name, project_workspace.name) as workspace_name
        from linear_issues issue
        left join linear_projects project on project.id = issue.project_id
        left join linear_teams issue_team on issue_team.id = issue.team_id
        left join linear_workspaces issue_workspace on issue_workspace.id = issue_team.workspace_id
        left join linear_teams project_team on project_team.id = project.team_id
        left join linear_workspaces project_workspace on project_workspace.id = project_team.workspace_id
      ) scope
    `,
  ]);

  const exactTotals = totalsFromSqlRows(projectRows, issueRows);
  const exactFilterOptions = filterOptionsFromSqlRows({
    priorities: filterPriorityRows,
    projects: filterProjectRows,
    scopes: filterScopeRows,
    statuses: filterStatusRows,
  });

  return buildLinearProjectDashboard({
    exactFilterOptions,
    exactTotals,
    filters,
    now,
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
  exactFilterOptions?: LinearProjectDashboardFilterOptions;
  exactTotals?: LinearProjectDashboardTotals;
  filters?: LinearProjectDashboardFilters;
  githubProof: LinearGithubProofRow[];
  issues: LinearDashboardIssueRow[];
  now: Date;
  projects: LinearDashboardProjectRow[];
}): LinearProjectDashboard {
  const activeFilters = normalizeDashboardFilters(input.filters);
  const proofByIdentifier = githubProofByIdentifier(input.githubProof, input.issues);
  const allIssues = input.issues.map((row) => toIssue(row, proofByIdentifier.get(row.identifier) ?? [], input.now));
  const filteredIssues = allIssues.filter((issue) => issueMatchesFilters(issue, activeFilters));
  const issuesByProject = new Map<string, LinearDashboardIssue[]>();

  for (const issue of filteredIssues) {
    issuesByProject.set(issue.projectId ?? "unassigned", [
      ...(issuesByProject.get(issue.projectId ?? "unassigned") ?? []),
      issue,
    ]);
  }

  const hasIssueScopedFilters = activeFilters.status !== undefined || activeFilters.priority !== undefined;
  const projectRows = input.projects
    .filter((project) => projectMatchesFilters(project, activeFilters))
    .filter((project) => !hasIssueScopedFilters || (issuesByProject.get(project.id)?.length ?? 0) > 0);
  const projects = projectRows.map((project) => toProject(project, issuesByProject.get(project.id) ?? []));
  const unassignedIssues = issuesByProject.get("unassigned") ?? [];

  if (unassignedIssues.length > 0) {
    projects.push(unassignedProject(unassignedIssues));
  }

  const blockedIssues = filteredIssues.filter((issue) => issue.statusCategory === "blocked");
  const doneIssues = filteredIssues.filter((issue) => issue.statusCategory === "done");
  const highPriorityIssues = filteredIssues.filter((issue) => issue.isHighPriority);
  const staleIssues = filteredIssues.filter((issue) => issue.isStale);
  const unownedIssues = filteredIssues.filter((issue) => !issue.assignee);
  const issuesMissingGithubProof = filteredIssues
    .filter((issue) => issue.statusCategory !== "canceled" && !issue.hasGithubProof)
    .sort(byPlanningPriority);
  const resumeWorthyCompletedIssues = doneIssues
    .filter((issue) => issue.hasGithubProof)
    .map((issue) => ({ issue, proof: issue.githubProof }));

  return {
    activeFilters,
    blockedIssues: blockedIssues.slice(0, MAX_SIGNAL_ROWS),
    cycleProgress: projects.map((project) => ({
      projectId: project.id,
      projectName: project.name,
      progress: project.progress,
      source: "linear_project_progress",
      state: project.progress === null ? "missing" : "tracked",
    })),
    filterOptions: input.exactFilterOptions ?? filterOptions(input.projects, allIssues),
    highPriorityIssues: highPriorityIssues.slice(0, MAX_SIGNAL_ROWS),
    issuesMissingGithubProof: issuesMissingGithubProof.slice(0, MAX_SIGNAL_ROWS),
    planningCandidates: filteredIssues
      .filter((issue) => issue.statusCategory === "open" || issue.statusCategory === "blocked")
      .sort(byPlanningPriority)
      .slice(0, 10),
    priorityDistribution: priorityDistribution(filteredIssues),
    projectGroups: projectGroups(projects),
    projects,
    resumeWorthyCompletedIssues: resumeWorthyCompletedIssues.slice(0, MAX_SIGNAL_ROWS),
    staleIssues: staleIssues.slice(0, MAX_SIGNAL_ROWS),
    totals: input.exactTotals ?? {
      blockedIssues: blockedIssues.length,
      doneIssues: doneIssues.length,
      highPriorityIssues: highPriorityIssues.length,
      issues: filteredIssues.length,
      missingGithubProof: issuesMissingGithubProof.length,
      openIssues: filteredIssues.filter((issue) => issue.statusCategory === "open").length,
      projects: projects.filter((project) => project.id !== "unassigned").length,
      resumeWorthyCompletedIssues: resumeWorthyCompletedIssues.length,
      staleIssues: staleIssues.length,
      unownedIssues: unownedIssues.length,
    },
    unownedIssues: unownedIssues.slice(0, MAX_SIGNAL_ROWS),
  };
}

export function parseLinearProjectDashboardFilters(
  input: Record<string, string | string[] | undefined>,
): LinearProjectDashboardFilters {
  return normalizeDashboardFilters({
    priority: parsePriorityFilter(singleParam(input.priority)),
    projectId: singleParam(input.project),
    status: parseStatusFilter(singleParam(input.status)),
    teamName: singleParam(input.team),
    workspaceName: singleParam(input.workspace),
  });
}

function totalsFromSqlRows(
  projectRows: LinearProjectSqlRow[],
  issueRows: LinearIssueSqlRow[],
): LinearProjectDashboardTotals {
  const issue = issueRows[0];

  return {
    blockedIssues: numberCount(issue?.total_blocked_issues),
    doneIssues: numberCount(issue?.total_done_issues),
    highPriorityIssues: numberCount(issue?.total_high_priority_issues),
    issues: numberCount(issue?.total_issues),
    missingGithubProof: numberCount(issue?.total_missing_github_proof),
    openIssues: numberCount(issue?.total_open_issues),
    projects: numberCount(projectRows[0]?.total_projects),
    resumeWorthyCompletedIssues: numberCount(issue?.total_resume_worthy_completed_issues),
    staleIssues: numberCount(issue?.total_stale_issues),
    unownedIssues: numberCount(issue?.total_unowned_issues),
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

function filterOptionsFromSqlRows(input: {
  priorities: LinearFilterCountSqlRow[];
  projects: LinearFilterProjectSqlRow[];
  scopes: LinearFilterScopeSqlRow[];
  statuses: LinearFilterCountSqlRow[];
}): LinearProjectDashboardFilterOptions {
  const projects = input.projects.map((project) => ({
    id: project.id,
    name: sanitize(project.name) ?? "Unnamed project",
    teamName: sanitize(project.team_name) || "Unknown team",
    workspaceName: sanitize(project.workspace_name) || "Unknown workspace",
  }));
  const priorities = input.priorities.flatMap((row) => {
    const priority = parsePriorityFilter(row.value);

    return priority === undefined
      ? []
      : [{
          count: numberCount(row.count),
          label: priorityLabel(priority),
          value: priority,
        }];
  });
  const statuses = input.statuses.flatMap((row) => {
    const status = parseStatusFilter(String(row.value));

    return status === undefined
      ? []
      : [{
          count: numberCount(row.count),
          label: status,
          value: status,
        }];
  });

  return {
    priorities,
    projects,
    statuses,
    teams: sortedUnique(input.scopes.map((scope) => sanitize(scope.team_name) || "Unknown team")),
    workspaces: sortedUnique(input.scopes.map((scope) => sanitize(scope.workspace_name) || "Unknown workspace")),
  };
}

function filterOptions(
  projectRows: LinearDashboardProjectRow[],
  issues: LinearDashboardIssue[],
): LinearProjectDashboardFilterOptions {
  const projectOptions = projectRows
    .map((project) => ({
      id: project.id,
      name: sanitize(project.name) ?? "Unnamed project",
      teamName: sanitize(project.teamName) || "Unknown team",
      workspaceName: sanitize(project.workspaceName) || "Unknown workspace",
    }))
    .sort((first, second) =>
      first.workspaceName.localeCompare(second.workspaceName) ||
      first.teamName.localeCompare(second.teamName) ||
      first.name.localeCompare(second.name)
    );

  return {
    priorities: priorityDistribution(issues).map((item) => ({
      count: item.count,
      label: item.label,
      value: item.priority,
    })),
    projects: projectOptions,
    statuses: statusDistribution(issues),
    teams: sortedUnique([
      ...projectOptions.map((project) => project.teamName),
      ...issues.map((issue) => issue.teamName),
    ]),
    workspaces: sortedUnique([
      ...projectOptions.map((project) => project.workspaceName),
      ...issues.map((issue) => issue.workspaceName),
    ]),
  };
}

function issueMatchesFilters(
  issue: LinearDashboardIssue,
  filters: LinearProjectDashboardFilters,
): boolean {
  if (filters.workspaceName && issue.workspaceName !== filters.workspaceName) {
    return false;
  }

  if (filters.teamName && issue.teamName !== filters.teamName) {
    return false;
  }

  if (filters.projectId && issue.projectId !== filters.projectId) {
    return false;
  }

  if (filters.status && issue.statusCategory !== filters.status) {
    return false;
  }

  if (filters.priority && issue.priority !== filters.priority) {
    return false;
  }

  return true;
}

function projectMatchesFilters(
  project: LinearDashboardProjectRow,
  filters: LinearProjectDashboardFilters,
): boolean {
  if (filters.workspaceName && (sanitize(project.workspaceName) || "Unknown workspace") !== filters.workspaceName) {
    return false;
  }

  if (filters.teamName && (sanitize(project.teamName) || "Unknown team") !== filters.teamName) {
    return false;
  }

  if (filters.projectId && project.id !== filters.projectId) {
    return false;
  }

  return true;
}

function statusDistribution(issues: LinearDashboardIssue[]): LinearProjectDashboardFilterOptions["statuses"] {
  const counts = new Map<LinearIssueStatusCategory, number>();

  for (const issue of issues) {
    counts.set(issue.statusCategory, (counts.get(issue.statusCategory) ?? 0) + 1);
  }

  return (["open", "blocked", "done", "canceled"] satisfies LinearIssueStatusCategory[])
    .map((status) => ({
      count: counts.get(status) ?? 0,
      label: status,
      value: status,
    }))
    .filter((status) => status.count > 0);
}

function normalizeDashboardFilters(
  filters: LinearProjectDashboardFilters | undefined,
): LinearProjectDashboardFilters {
  const workspaceName = normalizeFilterText(filters?.workspaceName);
  const teamName = normalizeFilterText(filters?.teamName);
  const projectId = normalizeFilterText(filters?.projectId);
  const status = parseStatusFilter(filters?.status);
  const priority = parsePriorityFilter(filters?.priority);

  return {
    ...(priority ? { priority } : {}),
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    ...(teamName ? { teamName } : {}),
    ...(workspaceName ? { workspaceName } : {}),
  };
}

function parseStatusFilter(value: string | undefined): LinearIssueStatusCategory | undefined {
  switch (value) {
    case "blocked":
    case "canceled":
    case "done":
    case "open":
      return value;
    default:
      return undefined;
  }
}

function parsePriorityFilter(value: number | string | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 4 ? value : undefined;
  }

  if (!value) {
    return undefined;
  }

  const priority = Number(value);

  return Number.isInteger(priority) && priority >= 1 && priority <= 4 ? priority : undefined;
}

function normalizeFilterText(value: string | undefined): string | undefined {
  const sanitized = sanitize(value?.slice(0, 120) ?? null);

  return sanitized || undefined;
}

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((first, second) => first.localeCompare(second));
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

function numberCount(value: string | number | undefined): number {
  return Number(value ?? 0);
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
