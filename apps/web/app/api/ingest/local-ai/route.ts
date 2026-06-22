import {
  closeSqlClient,
  createSqlClient,
  insertIngestionRun,
  upsertAiChatSessions,
  upsertEvidenceEmbeddings,
  upsertEvidenceItems,
} from "@repo/db";
import {
  getOptionalString,
  isJsonObject,
  jsonError,
  jsonOk,
  methodNotAllowed,
  readJsonObject,
  requireApiAuth,
} from "../../_lib/route-utils";
import { ingestLocalAiChats } from "@repo/ai-chat-ingestors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_TYPES = new Set([
  "local_session",
  "cloud_export",
  "manual_export",
  "workspace_export",
]);

export function GET() {
  return methodNotAllowed(["POST"]);
}

export async function POST(request: Request) {
  const authError = requireApiAuth(request);

  if (authError !== null) {
    return authError;
  }

  const body = await readJsonObject(request);

  if (!body.ok) {
    return body.response;
  }

  const sourceType = getOptionalString(body.value, "sourceType");

  if (sourceType === undefined || !SOURCE_TYPES.has(sourceType)) {
    return jsonError(400, "invalid_source_type", "sourceType must be one of the supported ingestion source types.", {
      supportedSourceTypes: Array.from(SOURCE_TYPES),
    });
  }

  const sourcePath = getOptionalString(body.value, "sourcePath");

  if (sourceType !== "local_session") {
    return jsonError(422, "unsupported_source_type", "Only local_session ingestion is implemented in this build.", {
      sourceType,
    });
  }

  if (sourcePath === undefined) {
    return jsonError(400, "missing_field", "sourcePath is required for local_session ingestion.", {
      field: "sourcePath",
    });
  }

  try {
    const result = await ingestLocalAiChats({
      codexSessionsDir: sourcePath,
      ...parsePrivacyOptions(body.value),
      sourceRoots: [sourcePath],
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
        source: `local_session:${sourcePath}`,
        status: "success",
        summary: `Imported ${result.sessions.length} session(s), ${result.evidence.length} evidence item(s), ${writtenEmbeddings} embedding(s), and ${writtenTranscripts} transcript(s).`,
      });
    } finally {
      await closeSqlClient(sql);
    }

    return jsonOk({
      sourceType,
      sourcePath,
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
  } catch (error) {
    return jsonError(500, "local_ai_ingestion_failed", "Local AI chat ingestion failed.", {
      message: error instanceof Error ? error.message : "Unknown ingestion error.",
    });
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
