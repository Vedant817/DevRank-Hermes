import {
  closeSqlClient,
  createSqlClient,
  insertScoreSnapshot,
  listScoringEvidence,
  type ScoringEvidenceScope,
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
import { computeSdeReadinessSnapshot } from "@repo/scoring";
import { evidenceSources } from "@repo/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = new Set<string>(["all", "user", "repo", "pull_request"]);
const EVIDENCE_SOURCES = new Set<string>(evidenceSources);

type EvidenceItems = Parameters<typeof computeSdeReadinessSnapshot>[0];
type EvidenceItem = EvidenceItems[number];

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

  if (body.value.evidence !== undefined) {
    const evidence = parseEvidenceItems(body.value.evidence);

    if (!evidence.ok) {
      return evidence.response;
    }

    const generatedAt = getOptionalString(body.value, "generatedAt");
    const snapshot = computeSdeReadinessSnapshot(evidence.value, generatedAt);

    return jsonOk({
      snapshot,
      evidenceCount: evidence.value.length,
    });
  }

  const scope = getOptionalString(body.value, "scope") ?? "all";

  if (!SCOPES.has(scope)) {
    return jsonError(400, "invalid_scope", "scope must be all, user, repo, or pull_request.", {
      supportedScopes: Array.from(SCOPES),
    });
  }

  const targetId = getOptionalString(body.value, "targetId");

  if (scope !== "all" && targetId === undefined) {
    return jsonError(400, "missing_field", "targetId is required for scoped score recomputation.", {
      field: "targetId",
      scope,
    });
  }

  try {
    const sql = createSqlClient();

    try {
      const scoringScope = scope as ScoringEvidenceScope;
      const evidence = await listScoringEvidence(sql, {
        scope: scoringScope,
        targetId,
      });

      if (evidence.length === 0) {
        return jsonError(422, "evidence_required", "No persisted evidence matched the requested score recomputation scope.", {
          scope,
          targetId,
        });
      }

      const snapshot = computeSdeReadinessSnapshot(evidence);

      if (scope === "all" || scope === "user") {
        await insertScoreSnapshot(sql, snapshot);
      }

      return jsonOk({
        snapshot,
        evidenceCount: evidence.length,
        scope,
        targetId,
        stored: scope === "all" || scope === "user",
      });
    } finally {
      await closeSqlClient(sql);
    }
  } catch (error) {
    return jsonError(503, "score_recompute_failed", error instanceof Error ? error.message : "Score recomputation failed.");
  }
}

function parseEvidenceItems(value: unknown) {
  if (!Array.isArray(value)) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "evidence must be an array."),
    };
  }

  const evidence: EvidenceItems = [];

  for (const [index, item] of value.entries()) {
    const parsed = parseEvidenceItem(item, index);

    if (!parsed.ok) {
      return parsed;
    }

    evidence.push(parsed.value);
  }

  return { ok: true as const, value: evidence };
}

function parseEvidenceItem(value: unknown, index: number) {
  if (!isJsonObject(value)) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "Each evidence item must be a JSON object.", {
        index,
      }),
    };
  }

  const id = value.id;
  const source = value.source;
  const title = value.title;
  const summary = value.summary;
  const occurredAt = value.occurredAt;
  const url = value.url;
  const metadata = value.metadata;

  if (
    typeof id !== "string" ||
    typeof source !== "string" ||
    !EVIDENCE_SOURCES.has(source) ||
    typeof title !== "string" ||
    typeof summary !== "string" ||
    typeof occurredAt !== "string"
  ) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "Evidence items require id, source, title, summary, and occurredAt.", {
        index,
        supportedSources: Array.from(EVIDENCE_SOURCES),
      }),
    };
  }

  if (url !== undefined && typeof url !== "string") {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "Evidence item url must be a string when provided.", {
        index,
      }),
    };
  }

  if (metadata !== undefined && !isJsonObject(metadata)) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_evidence", "Evidence item metadata must be a JSON object when provided.", {
        index,
      }),
    };
  }

  const evidence: EvidenceItem = {
    id,
    source: source as EvidenceItem["source"],
    title,
    summary,
    occurredAt,
  };

  if (url !== undefined) {
    evidence.url = url;
  }

  if (metadata !== undefined) {
    evidence.metadata = metadata;
  }

  return { ok: true as const, value: evidence };
}
