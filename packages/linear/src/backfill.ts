import { linearGraphql } from "./client.js";
import type { LinearBackfillResult } from "./types.js";

interface LinearBackfillQuery {
  organization?: {
    id?: string | null;
    name?: string | null;
    urlKey?: string | null;
  } | null;
  projects?: {
    nodes: Array<{
      id: string;
      name: string;
      state?: string | null;
      progress?: number | null;
      url?: string | null;
      team?: { id?: string | null; key?: string | null; name?: string | null } | null;
    }>;
    pageInfo: LinearPageInfo;
  } | null;
  issues?: {
    nodes: Array<{
      id: string;
      identifier: string;
      title: string;
      priority: number;
      url: string;
      updatedAt?: string | null;
      state?: { name?: string | null } | null;
      assignee?: { name?: string | null } | null;
      project?: { id?: string | null } | null;
      team?: { id?: string | null; key?: string | null; name?: string | null } | null;
    }>;
    pageInfo: LinearPageInfo;
  } | null;
}

interface LinearPageInfo {
  endCursor?: string | null;
  hasNextPage: boolean;
}

export type LinearGraphqlExecutor = <T>(
  query: string,
  variables: Record<string, unknown>,
) => Promise<T>;

export interface LinearBackfillOptions {
  first?: number;
  workspace?: string;
}

const MAX_LINEAR_PAGE_SIZE = 100;
const MAX_LINEAR_BACKFILL_PAGES = 1_000;

const backfillQuery = `
  query DevRankLinearBackfill(
    $first: Int!
    $includeIssues: Boolean!
    $includeProjects: Boolean!
    $issuesAfter: String
    $projectsAfter: String
  ) {
    organization {
      id
      name
      urlKey
    }
    projects(first: $first, after: $projectsAfter, orderBy: updatedAt)
      @include(if: $includeProjects) {
      nodes {
        id
        name
        state
        progress
        url
        team { id key name }
      }
      pageInfo { endCursor hasNextPage }
    }
    issues(first: $first, after: $issuesAfter, orderBy: updatedAt)
      @include(if: $includeIssues) {
      nodes {
        id
        identifier
        title
        priority
        url
        updatedAt
        state { name }
        assignee { name }
        project { id }
        team { id key name }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

export async function backfillLinear(
  firstOrOptions: number | LinearBackfillOptions = MAX_LINEAR_PAGE_SIZE,
  graphql: LinearGraphqlExecutor = linearGraphql,
): Promise<LinearBackfillResult> {
  const options = normalizeBackfillOptions(firstOrOptions);
  const pageSize = normalizePageSize(options.first);
  const projectRows = new Map<string, LinearBackfillResult["projects"][number]>();
  const issueRows = new Map<string, LinearBackfillResult["issues"][number]>();
  let includeProjects = true;
  let includeIssues = true;
  let projectsAfter: string | null = null;
  let issuesAfter: string | null = null;
  let organization: LinearBackfillQuery["organization"];
  let pages = 0;

  while (includeProjects || includeIssues) {
    pages += 1;

    if (pages > MAX_LINEAR_BACKFILL_PAGES) {
      throw new Error(`Linear backfill exceeded ${MAX_LINEAR_BACKFILL_PAGES} pages.`);
    }

    const data = await graphql<LinearBackfillQuery>(backfillQuery, {
      first: pageSize,
      includeIssues,
      includeProjects,
      issuesAfter,
      projectsAfter,
    });
    organization ??= data.organization;
    assertRequestedWorkspace(options.workspace, organization);

    for (const project of data.projects?.nodes ?? []) {
      projectRows.set(project.id, {
      id: project.id,
      name: project.name,
      state: project.state ?? null,
      progress: project.progress ?? null,
      url: project.url ?? null,
      teamKey: project.team?.key ?? null,
      teamId: project.team?.id ?? null,
      teamName: project.team?.name ?? null,
      workspaceId: organization?.id ?? null,
      workspaceName: organization?.name ?? null,
      workspaceUrlKey: organization?.urlKey ?? null,
      });
    }

    for (const issue of data.issues?.nodes ?? []) {
      issueRows.set(issue.id, {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      priority: issue.priority,
      url: issue.url,
      state: issue.state?.name ?? null,
      assignee: issue.assignee?.name ?? null,
      projectId: issue.project?.id ?? null,
      teamKey: issue.team?.key ?? null,
      teamId: issue.team?.id ?? null,
      teamName: issue.team?.name ?? null,
      updatedAt: issue.updatedAt ?? null,
      workspaceId: organization?.id ?? null,
      workspaceName: organization?.name ?? null,
      workspaceUrlKey: organization?.urlKey ?? null,
      });
    }

    if (includeProjects) {
      const next = nextCursor(data.projects?.pageInfo, "projects");
      includeProjects = next.hasNextPage;
      projectsAfter = next.endCursor;
    }

    if (includeIssues) {
      const next = nextCursor(data.issues?.pageInfo, "issues");
      includeIssues = next.hasNextPage;
      issuesAfter = next.endCursor;
    }
  }

  return {
    projects: [...projectRows.values()],
    issues: [...issueRows.values()],
  };
}

function nextCursor(pageInfo: LinearPageInfo | null | undefined, connection: string) {
  if (!pageInfo) {
    throw new Error(`Linear backfill response omitted ${connection} pageInfo.`);
  }

  if (pageInfo.hasNextPage && !pageInfo.endCursor) {
    throw new Error(`Linear backfill ${connection} page has no end cursor.`);
  }

  return {
    endCursor: pageInfo.endCursor ?? null,
    hasNextPage: pageInfo.hasNextPage,
  };
}

function normalizePageSize(value: number) {
  if (!Number.isFinite(value)) {
    return MAX_LINEAR_PAGE_SIZE;
  }

  return Math.max(1, Math.min(Math.floor(value), MAX_LINEAR_PAGE_SIZE));
}

function normalizeBackfillOptions(
  firstOrOptions: number | LinearBackfillOptions,
): Required<Pick<LinearBackfillOptions, "first">> & Pick<LinearBackfillOptions, "workspace"> {
  if (typeof firstOrOptions === "number") {
    return {
      first: firstOrOptions,
      workspace: undefined,
    };
  }

  const workspace = firstOrOptions.workspace?.trim();

  return {
    first: firstOrOptions.first ?? MAX_LINEAR_PAGE_SIZE,
    workspace: workspace || undefined,
  };
}

function assertRequestedWorkspace(
  requestedWorkspace: string | undefined,
  organization: LinearBackfillQuery["organization"],
) {
  if (!requestedWorkspace) {
    return;
  }

  const normalizedRequested = requestedWorkspace.toLowerCase();
  const matches = [
    organization?.id,
    organization?.name,
    organization?.urlKey,
  ].some((candidate) => candidate?.trim().toLowerCase() === normalizedRequested);

  if (!matches) {
    const actualWorkspace = organization?.name ?? organization?.urlKey ?? organization?.id ?? "unknown";

    throw new Error(
      `Linear token resolved workspace "${actualWorkspace}", not requested workspace "${requestedWorkspace}".`,
    );
  }
}
