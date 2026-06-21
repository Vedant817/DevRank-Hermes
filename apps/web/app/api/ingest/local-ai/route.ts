import {
  closeSqlClient,
  createSqlClient,
  insertIngestionRun,
  upsertEvidenceItems,
} from "@repo/db";
import {
  getOptionalString,
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
    });
    const sql = createSqlClient();
    let writtenEvidence = 0;

    try {
      writtenEvidence = await upsertEvidenceItems(sql, result.evidence);
      await insertIngestionRun(sql, {
        source: `local_session:${sourcePath}`,
        status: "success",
        summary: `Imported ${result.sessions.length} session(s) and ${result.evidence.length} evidence item(s).`,
      });
    } finally {
      await closeSqlClient(sql);
    }

    return jsonOk({
      sourceType,
      sourcePath,
      sessionCount: result.sessions.length,
      evidenceCount: result.evidence.length,
      writtenEvidence,
      redactionCount: result.redactionCount,
      evidence: result.evidence,
    });
  } catch (error) {
    return jsonError(500, "local_ai_ingestion_failed", "Local AI chat ingestion failed.", {
      message: error instanceof Error ? error.message : "Unknown ingestion error.",
    });
  }
}
