import { linearGraphql } from "./client.js";
import type { LinearBackfillResult } from "./types.js";

interface LinearBackfillQuery {
  organization?: {
    id?: string | null;
    name?: string | null;
    urlKey?: string | null;
  } | null;
  projects: {
    nodes: Array<{
      id: string;
      name: string;
      state?: string | null;
      progress?: number | null;
      url?: string | null;
      team?: { id?: string | null; key?: string | null; name?: string | null } | null;
    }>;
  };
  issues: {
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
  };
}

const backfillQuery = `
  query DevRankLinearBackfill($first: Int!) {
    organization {
      id
      name
      urlKey
    }
    projects(first: $first, orderBy: updatedAt) {
      nodes {
        id
        name
        state
        progress
        url
        team { id key name }
      }
    }
    issues(first: $first, orderBy: updatedAt) {
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
    }
  }
`;

export async function backfillLinear(first = 100): Promise<LinearBackfillResult> {
  const data = await linearGraphql<LinearBackfillQuery>(backfillQuery, { first });

  return {
    projects: data.projects.nodes.map((project) => ({
      id: project.id,
      name: project.name,
      state: project.state ?? null,
      progress: project.progress ?? null,
      url: project.url ?? null,
      teamKey: project.team?.key ?? null,
      teamId: project.team?.id ?? null,
      teamName: project.team?.name ?? null,
      workspaceId: data.organization?.id ?? null,
      workspaceName: data.organization?.name ?? null,
      workspaceUrlKey: data.organization?.urlKey ?? null,
    })),
    issues: data.issues.nodes.map((issue) => ({
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
      workspaceId: data.organization?.id ?? null,
      workspaceName: data.organization?.name ?? null,
      workspaceUrlKey: data.organization?.urlKey ?? null,
    })),
  };
}
