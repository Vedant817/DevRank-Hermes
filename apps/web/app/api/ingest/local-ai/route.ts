import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import {
  closeSqlClient,
  createSqlClient,
  insertIngestionRun,
  upsertAiChatSessions,
  upsertEvidenceEmbeddings,
  upsertEvidenceItems,
} from "@repo/db";
import { embedTexts } from "@repo/embeddings";
import {
  containsLikelySecretInJson,
  getOptionalString,
  isJsonObject,
  jsonError,
  jsonOk,
  methodNotAllowed,
  rateLimit,
  readJsonObject,
  requireApiAuth,
} from "../../_lib/route-utils";
import { ingestLocalAiChats } from "@repo/ai-chat-ingestors";
import type { EvidenceItem, EvidenceSource } from "@repo/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_TYPES = new Set([
  "local_session",
  "cloud_export",
  "manual_export",
  "workspace_export",
]);
const EXPORT_SOURCE_TYPES = new Set<EvidenceSource>([
  "cloud_export",
  "manual_export",
  "workspace_export",
]);
const MAX_IMPORTED_EVIDENCE_ITEMS = 100;
const MAX_IMPORTED_EMBEDDING_ITEMS = 25;
const MAX_EVIDENCE_ID_LENGTH = 256;
const MAX_EVIDENCE_TITLE_LENGTH = 500;
const MAX_EVIDENCE_SUMMARY_LENGTH = 10_000;
const MAX_EVIDENCE_URL_LENGTH = 2_000;

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const limitError = rateLimit(request, {
    key: "local_ai_ingest",
    limit: 10,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireApiAuth(request, {
    scopedEnvName: "DEVRANK_INGEST_TOKEN",
    label: "ingestion token",
  });

  if (authError !== null) {
    return authError;
  }

  const body = await readJsonObject(request, { maxBytes: 1024 * 1024 });

  if (!body.ok) {
    return body.response;
  }

  const sourceType = getOptionalString(body.value, "sourceType");

  if (sourceType === undefined || !SOURCE_TYPES.has(sourceType)) {
    return jsonError(400, "invalid_source_type", "sourceType must be one of the supported ingestion source types.", {
      supportedSourceTypes: Array.from(SOURCE_TYPES),
    });
  }

  const privacy = parsePrivacyOptions(body.value);

  if (sourceType !== "local_session") {
    return ingestEvidenceExport(body.value, sourceType as EvidenceSource, privacy);
  }

  const sourcePath = getOptionalString(body.value, "sourcePath");

  if (sourcePath === undefined) {
    return jsonError(400, "missing_field", "sourcePath is required for local_session ingestion.", {
      field: "sourcePath",
    });
  }

  const validatedPath = validateLocalSourcePath(sourcePath);

  if (!validatedPath.ok) {
    return validatedPath.response;
  }

  try {
    const result = await ingestLocalAiChats({
      codexSessionsDir: validatedPath.value,
      ...privacy,
      sourceRoots: [validatedPath.value],
    });
    const sql = createSqlClient();
    let writtenEmbeddings = 0;
    let writtenEvidence = 0;
    let writtenTranscripts = 0;

    try {
      writtenEvidence = await upsertEvidenceItems(sql, result.evidence);
      writtenEmbeddings = await upsertEvidenceEmbeddings(sql, result.embeddings);
      writtenTranscripts = await upsertAiChatSessions(sql, result.transcripts);
      await insertIngestionRun(sql, {
        source: `local_session:${validatedPath.value}`,
        status: "success",
        summary: `Imported ${result.sessions.length} session(s), ${result.evidence.length} evidence item(s), ${writtenEmbeddings} embedding(s), and ${writtenTranscripts} transcript(s).`,
      });
    } finally {
      await closeSqlClient(sql);
    }

    return jsonOk({
      sourceType,
      sourcePath: validatedPath.value,
      sessionCount: result.sessions.length,
      evidenceCount: result.evidence.length,
      embeddingCount: result.embeddings.length,
      writtenEvidence,
      writtenEmbeddings,
      writtenTranscripts,
      redactionCount: result.redactionCount,
      privacy: result.privacy,
      evidence: result.evidence,
    });
  } catch {
    return jsonError(500, "local_ai_ingestion_failed", "Local AI chat ingestion failed.");
  }
}

async function ingestEvidenceExport(
  body: Record<string, unknown>,
  sourceType: EvidenceSource,
  privacy: ReturnType<typeof parsePrivacyOptions>,
) {
  if (!EXPORT_SOURCE_TYPES.has(sourceType)) {
    return jsonError(400, "invalid_source_type", "sourceType must be a supported export source type.", {
      sourceType,
    });
  }

  if (privacy.rawStorageEnabled) {
    return jsonError(400, "raw_storage_unavailable", "Imported export summaries cannot request raw transcript storage.", {
      sourceType,
    });
  }

  const evidenceResult = parseImportedEvidence(body, sourceType);

  if (!evidenceResult.ok) {
    return evidenceResult.response;
  }

  const evidence = evidenceResult.value;

  if (privacy.storeEmbeddings && evidence.length > MAX_IMPORTED_EMBEDDING_ITEMS) {
    return jsonError(400, "embedding_batch_too_large", "Embedding generation is limited for imported evidence batches.", {
      maxItems: MAX_IMPORTED_EMBEDDING_ITEMS,
    });
  }

  try {
    const embeddings = privacy.storeEmbeddings ? await embedEvidence(evidence) : [];
    const sql = createSqlClient();
    let writtenEmbeddings = 0;
    let writtenEvidence = 0;

    try {
      writtenEvidence = await upsertEvidenceItems(sql, evidence);
      writtenEmbeddings = await upsertEvidenceEmbeddings(sql, embeddings);
      await insertIngestionRun(sql, {
        source: `${sourceType}:${getOptionalString(body, "sourceName") ?? "request"}`,
        status: "success",
        summary: `Imported ${evidence.length} evidence item(s) and ${writtenEmbeddings} embedding(s) from ${sourceType}.`,
      });
    } finally {
      await closeSqlClient(sql);
    }

    return jsonOk({
      sourceType,
      sourceName: getOptionalString(body, "sourceName"),
      evidenceCount: evidence.length,
      embeddingCount: embeddings.length,
      writtenEvidence,
      writtenEmbeddings,
      privacy: {
        embeddingStatus: privacy.storeEmbeddings ? "generated" : "disabled",
        rawStorageStatus: "summaries_only",
        redactionStatus: "passed",
        storeEmbeddings: privacy.storeEmbeddings,
        uploadRawChats: false,
      },
      evidence,
    });
  } catch {
    return jsonError(500, "export_ingestion_failed", "Evidence export ingestion failed.");
  }
}

function parsePrivacyOptions(value: Record<string, unknown>) {
  const privacy = isJsonObject(value.privacy) ? value.privacy : {};

  return {
    rawStorageEnabled: booleanValue(privacy.uploadRawChats, false),
    redactSecrets: booleanValue(privacy.redactSecrets, true),
    storeEmbeddings: booleanValue(privacy.storeEmbeddings, false),
  };
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parseImportedEvidence(
  body: Record<string, unknown>,
  sourceType: EvidenceSource,
) {
  const value = body.evidence;

  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "evidence must be a non-empty array of redacted summary items."),
    };
  }

  if (value.length > MAX_IMPORTED_EVIDENCE_ITEMS) {
    return {
      ok: false as const,
      response: jsonError(400, "evidence_batch_too_large", "Imported evidence batches are limited.", {
        maxItems: MAX_IMPORTED_EVIDENCE_ITEMS,
      }),
    };
  }

  const evidence: EvidenceItem[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];

    if (!isJsonObject(item)) {
      return {
        ok: false as const,
        response: jsonError(400, "invalid_evidence", "Each evidence item must be a JSON object.", { index }),
      };
    }

    const parsed = parseImportedEvidenceItem(item, sourceType, index);

    if (!parsed.ok) {
      return parsed;
    }

    evidence.push(parsed.value);
  }

  return { ok: true as const, value: evidence };
}

function parseImportedEvidenceItem(
  item: Record<string, unknown>,
  sourceType: EvidenceSource,
  index: number,
) {
  const title = trimmedString(item.title);
  const summary = trimmedString(item.summary);
  const id = trimmedString(item.id);
  const url = trimmedString(item.url);

  if (!title || !summary) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "Evidence items require non-empty title and summary.", { index }),
    };
  }

  if (id !== undefined && id.length > MAX_EVIDENCE_ID_LENGTH) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "Evidence id is too long.", {
        index,
        maxLength: MAX_EVIDENCE_ID_LENGTH,
      }),
    };
  }

  if (title.length > MAX_EVIDENCE_TITLE_LENGTH || summary.length > MAX_EVIDENCE_SUMMARY_LENGTH) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "Evidence title or summary is too long.", {
        index,
        maxSummaryLength: MAX_EVIDENCE_SUMMARY_LENGTH,
        maxTitleLength: MAX_EVIDENCE_TITLE_LENGTH,
      }),
    };
  }

  if (url !== undefined && url.length > MAX_EVIDENCE_URL_LENGTH) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "Evidence url is too long.", {
        index,
        maxLength: MAX_EVIDENCE_URL_LENGTH,
      }),
    };
  }

  const metadata = importedMetadata(item);

  if (containsLikelySecretInJson({
    id,
    metadata,
    summary,
    title,
    url,
  })) {
    return {
      ok: false as const,
      response: jsonError(422, "evidence_contains_secret", "Evidence item appears to contain a secret.", { index }),
    };
  }

  const occurredAt = parseOccurredAt(item.occurredAt, index);

  if (!occurredAt.ok) {
    return occurredAt;
  }

  const evidenceItem: EvidenceItem = {
    id: id ?? generatedEvidenceId(sourceType, index, title, summary),
    source: sourceType,
    title,
    summary,
    occurredAt: occurredAt.value,
    metadata,
  };

  if (url) {
    evidenceItem.url = url;
  }

  return { ok: true as const, value: evidenceItem };
}

function parseOccurredAt(value: unknown, index: number) {
  if (value === undefined) {
    return { ok: true as const, value: new Date().toISOString() };
  }

  const occurredAt = trimmedString(value);

  if (!occurredAt || Number.isNaN(new Date(occurredAt).getTime())) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "occurredAt must be a valid date string when provided.", { index }),
    };
  }

  return { ok: true as const, value: new Date(occurredAt).toISOString() };
}

function importedMetadata(item: Record<string, unknown>) {
  const metadata = isJsonObject(item.metadata) ? { ...item.metadata } : {};
  const preservedKeys = [
    "taskUrl",
    "taskId",
    "repository",
    "branch",
    "pullRequestUrl",
    "pullRequestNumber",
    "agent",
  ];

  for (const key of preservedKeys) {
    const value = item[key];

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[key] = value;
    }
  }

  return metadata;
}

function validateLocalSourcePath(sourcePath: string) {
  const allowedRoots = localIngestRoots();

  if (allowedRoots.length === 0) {
    return {
      ok: false as const,
      response: jsonError(503, "local_ingest_roots_required", "DEVRANK_LOCAL_INGEST_ROOTS must be configured before server-side local_session ingestion."),
    };
  }

  const resolvedPath = resolve(sourcePath);
  const isAllowed = allowedRoots.some((root) => isPathInsideRoot(resolvedPath, root));

  if (!isAllowed) {
    return {
      ok: false as const,
      response: jsonError(403, "source_path_not_allowed", "sourcePath is outside the configured local ingestion roots."),
    };
  }

  return { ok: true as const, value: resolvedPath };
}

function localIngestRoots() {
  const value = process.env.DEVRANK_LOCAL_INGEST_ROOTS?.trim();

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((root) => root.trim())
    .filter((root) => root.length > 0)
    .map((root) => resolve(root));
}

function isPathInsideRoot(path: string, root: string) {
  const pathFromRoot = relative(root, path);

  return path === root || (
    pathFromRoot.length > 0 &&
    !pathFromRoot.startsWith("..") &&
    !isAbsolute(pathFromRoot)
  );
}

async function embedEvidence(evidence: EvidenceItem[]) {
  const result = await embedTexts(evidence.map((item) => `${item.title}\n\n${item.summary}`));

  return evidence.map((item, index) => ({
    embedding: result.embeddings[index] ?? [],
    model: result.model,
    source: item.source,
    sourceId: item.id,
  }));
}

function generatedEvidenceId(
  sourceType: EvidenceSource,
  index: number,
  title: string,
  summary: string,
) {
  const digest = createHash("sha256")
    .update(`${sourceType}:${index}:${title}:${summary}`)
    .digest("hex")
    .slice(0, 16);

  return `${sourceType}:${digest}`;
}

function trimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
