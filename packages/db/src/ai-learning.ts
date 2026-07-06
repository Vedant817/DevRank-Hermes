import type { EvidenceSource } from "@repo/shared";
import type { SqlClient } from "./client.js";

const aiEvidenceSources = [
  "local_session",
  "cloud_export",
  "manual_export",
  "workspace_export",
] satisfies EvidenceSource[];

export interface AiAgentLearningDashboard {
  totals: {
    evidenceItems: number;
    reusableSkills: number;
    sessions: number;
    sources: number;
  };
  agentUsage: Array<{
    agentName: string;
    evidenceItems: number;
    lastSeenAt?: string;
    messages: number;
    sessions: number;
  }>;
  sourceBreakdown: Array<{
    count: number;
    source: string;
  }>;
  taskTypes: Array<{
    count: number;
    tag: string;
  }>;
  aiDependencyWarnings: LearningSignal[];
  improvementSignals: LearningSignal[];
  repeatedErrors: LearningSignal[];
  bestPrompts: Array<{
    agentName: string;
    confidenceScore: number;
    prompt: string;
    title: string;
  }>;
  reusableSkills: Array<{
    createdAt: string;
    skillTags: string[];
    summary: string;
    title: string;
  }>;
  sessionSignals: AiSessionMaturitySignal[];
}

export interface AiSessionMaturitySignal {
  commandsRun: string[];
  errorsFaced: string[];
  filesTouched: string[];
  prompts: string[];
  repeatedMistakes: string[];
  toolCalls: string[];
}

export interface AiLearningMemoryRow {
  createdAt: string;
  metadata: Record<string, unknown> | null;
  source: string;
  sourceId: string | null;
  summary: string;
  title: string;
}

export interface AiLearningSessionRow {
  agentName: string;
  messages: number;
  rawStored: boolean;
  sourceId: string | null;
  sourceType: string;
  startedAt: string | null;
}

export interface AiLearningSkillRow {
  createdAt: string;
  metadata: Record<string, unknown> | null;
  summary: string;
  title: string;
}

export interface LearningSignal {
  agentName: string;
  signal: string;
  source: string;
  title: string;
}

export async function getAiAgentLearningDashboard(
  sql: SqlClient,
): Promise<AiAgentLearningDashboard> {
  const [memoryRows, sessionRows, skillRows] = await Promise.all([
    sql<{
      created_at: Date | string;
      metadata: Record<string, unknown> | null;
      source: string;
      source_id: string | null;
      summary: string;
      title: string;
    }[]>`
      select source, source_id, title, summary, metadata, created_at
      from memory_items
      where source = any(${aiEvidenceSources})
      order by created_at desc
      limit 500
    `,
    sql<{
      agent_name: string;
      messages: string | number;
      raw_stored: boolean;
      source_id: string | null;
      source_type: string;
      started_at: Date | string | null;
    }[]>`
      select
        coalesce(a.name, 'Unknown agent') as agent_name,
        s.source_id,
        s.source_type,
        s.raw_stored,
        coalesce(s.started_at, s.created_at) as started_at,
        count(m.id) as messages
      from ai_sessions s
      left join ai_agents a on a.id = s.agent_id
      left join ai_messages m on m.session_id = s.id
      group by a.name, s.id, s.source_id, s.source_type, s.raw_stored, s.started_at, s.created_at
      order by coalesce(s.started_at, s.created_at) desc
      limit 500
    `,
    sql<{
      created_at: Date | string;
      metadata: Record<string, unknown> | null;
      summary: string;
      title: string;
    }[]>`
      select title, summary, metadata, created_at
      from memory_items
      where source = 'skill'
      order by created_at desc
      limit 20
    `,
  ]);

  return buildAiAgentLearningDashboard({
    memoryRows: memoryRows.map((row) => ({
      createdAt: toIso(row.created_at),
      metadata: row.metadata,
      source: row.source,
      sourceId: row.source_id,
      summary: row.summary,
      title: row.title,
    })),
    sessionRows: sessionRows.map((row) => ({
      agentName: row.agent_name,
      messages: Number(row.messages),
      rawStored: row.raw_stored,
      sourceId: row.source_id,
      sourceType: row.source_type,
      startedAt: row.started_at ? toIso(row.started_at) : null,
    })),
    skillRows: skillRows.map((row) => ({
      createdAt: toIso(row.created_at),
      metadata: row.metadata,
      summary: row.summary,
      title: row.title,
    })),
  });
}

export function buildAiAgentLearningDashboard(input: {
  memoryRows: AiLearningMemoryRow[];
  sessionRows: AiLearningSessionRow[];
  skillRows: AiLearningSkillRow[];
}): AiAgentLearningDashboard {
  const sessionsBySourceId = new Map(
    input.sessionRows
      .filter((row) => row.sourceId)
      .map((row) => [`${row.sourceType}:${row.sourceId}`, row]),
  );
  const agentUsage = new Map<string, {
    evidenceItems: number;
    lastSeenAt?: string;
    messages: number;
    sessions: number;
  }>();
  const sourceCounts = new Map<string, number>();
  const taskTypeCounts = new Map<string, number>();
  const aiDependencyWarnings: LearningSignal[] = [];
  const improvementSignals: LearningSignal[] = [];
  const repeatedErrors: LearningSignal[] = [];
  const bestPrompts: AiAgentLearningDashboard["bestPrompts"] = [];
  const sessionSignals: AiSessionMaturitySignal[] = [];

  for (const row of input.memoryRows) {
    const session = row.sourceId
      ? sessionsBySourceId.get(`${row.source}:${row.sourceId}`)
      : undefined;
    const agentName = metadataString(row.metadata, "agentName") ?? session?.agentName ?? "Unknown agent";
    const confidenceScore = metadataNumber(row.metadata, "confidenceScore");
    const usage = agentUsage.get(agentName) ?? {
      evidenceItems: 0,
      messages: 0,
      sessions: 0,
    };

    usage.evidenceItems += 1;
    usage.messages += session?.messages ?? 0;
    usage.sessions += 1;
    usage.lastSeenAt = maxIso(usage.lastSeenAt, row.createdAt);
    agentUsage.set(agentName, usage);
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);

    for (const tag of metadataStringArray(row.metadata, "skillTags")) {
      taskTypeCounts.set(tag, (taskTypeCounts.get(tag) ?? 0) + 1);
    }

    for (const signal of metadataStringArray(row.metadata, "weaknesses")) {
      aiDependencyWarnings.push({ agentName, signal, source: row.source, title: row.title });
    }

    if ((confidenceScore ?? 1) < 0.5) {
      aiDependencyWarnings.push({
        agentName,
        signal: "Low confidence from sparse implementation evidence.",
        source: row.source,
        title: row.title,
      });
    }

    for (const signal of [
      ...metadataStringArray(row.metadata, "strongPatterns"),
      ...metadataStringArray(row.metadata, "howSolved"),
    ]) {
      improvementSignals.push({ agentName, signal, source: row.source, title: row.title });
    }

    for (const signal of [
      ...metadataStringArray(row.metadata, "errorsFaced"),
      ...metadataStringArray(row.metadata, "repeatedMistakes"),
    ]) {
      repeatedErrors.push({ agentName, signal, source: row.source, title: row.title });
    }

    for (const prompt of metadataStringArray(row.metadata, "prompts")) {
      bestPrompts.push({
        agentName,
        confidenceScore: confidenceScore ?? 0,
        prompt,
        title: row.title,
      });
    }

    sessionSignals.push({
      commandsRun: metadataStringArray(row.metadata, "commandsRun"),
      errorsFaced: metadataStringArray(row.metadata, "errorsFaced"),
      filesTouched: metadataStringArray(row.metadata, "filesTouched"),
      prompts: metadataStringArray(row.metadata, "prompts"),
      repeatedMistakes: metadataStringArray(row.metadata, "repeatedMistakes"),
      toolCalls: metadataStringArray(row.metadata, "toolCalls"),
    });
  }

  for (const row of input.sessionRows.filter((session) => !session.sourceId)) {
    const usage = agentUsage.get(row.agentName) ?? {
      evidenceItems: 0,
      messages: 0,
      sessions: 0,
    };
    usage.messages += row.messages;
    usage.sessions += 1;
    usage.lastSeenAt = maxIso(usage.lastSeenAt, row.startedAt ?? undefined);
    agentUsage.set(row.agentName, usage);
    sourceCounts.set(row.sourceType, (sourceCounts.get(row.sourceType) ?? 0) + 1);
  }

  return {
    totals: {
      evidenceItems: input.memoryRows.length,
      reusableSkills: input.skillRows.length,
      sessions: [...agentUsage.values()].reduce((total, item) => total + item.sessions, 0),
      sources: sourceCounts.size,
    },
    agentUsage: sortByCount([...agentUsage.entries()].map(([agentName, value]) => ({
      agentName,
      ...value,
    }))),
    sourceBreakdown: sortByCount([...sourceCounts.entries()].map(([source, count]) => ({ source, count }))),
    taskTypes: sortByCount([...taskTypeCounts.entries()].map(([tag, count]) => ({ tag, count }))),
    aiDependencyWarnings: aiDependencyWarnings.slice(0, 10),
    improvementSignals: improvementSignals.slice(0, 10),
    repeatedErrors: repeatedErrors.slice(0, 10),
    bestPrompts: bestPrompts
      .sort((first, second) => second.confidenceScore - first.confidenceScore)
      .slice(0, 8),
    reusableSkills: input.skillRows.map((row) => ({
      createdAt: row.createdAt,
      skillTags: metadataStringArray(row.metadata, "skillTags"),
      summary: row.summary,
      title: row.title,
    })),
    sessionSignals,
  };
}

function metadataString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function metadataNumber(
  metadata: Record<string, unknown> | null,
  key: string,
): number | undefined {
  const value = metadata?.[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metadataStringArray(
  metadata: Record<string, unknown> | null,
  key: string,
): string[] {
  const value = metadata?.[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function sortByCount<T extends { count?: number; evidenceItems?: number; sessions?: number }>(items: T[]) {
  return items.sort((first, second) => {
    const firstCount = first.count ?? first.sessions ?? first.evidenceItems ?? 0;
    const secondCount = second.count ?? second.sessions ?? second.evidenceItems ?? 0;

    return secondCount - firstCount;
  });
}

function maxIso(first: string | undefined, second: string | undefined) {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return first > second ? first : second;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
