import {
  closeSqlClient,
  createSqlClient,
  getDsaQuestionBySlug,
  runInTransaction,
  updateDailyTaskStatus,
  upsertEvidenceItems,
  type DailyTaskStatus,
  type SqlClient,
} from "@repo/db";
import { isValidDateOnly, type EvidenceItem } from "@repo/shared";
import {
  containsLikelySecretInJson,
  getOptionalInteger,
  getOptionalString,
  getRequiredString,
  jsonError,
  jsonOk,
  methodNotAllowed,
  rateLimit,
  readJsonObject,
  requireApiAuth,
} from "../../_lib/route-utils";
import { evidenceId } from "./evidence-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TASK_KEY_PATTERN = /^[a-f0-9]{16}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 2_000;
const DEFAULT_TIME = "T12:00:00.000Z";

export async function POST(request: Request) {
  const limitError = await rateLimit(request, {
    key: "task_log_evidence",
    limit: 30,
    windowMs: 60_000,
  });

  if (limitError !== null) {
    return limitError;
  }

  const authError = requireApiAuth(request, {
    scopedEnvName: "DEVRANK_PLANNER_TOKEN",
    label: "planner token",
  });

  if (authError !== null) {
    return authError;
  }

  const body = await readJsonObject(request, { maxBytes: 16 * 1024 });

  if (!body.ok) {
    return body.response;
  }

  if (containsLikelySecretInJson(body.value)) {
    return jsonError(400, "secret_like_value", "Evidence cannot contain secrets or tokens.");
  }

  const title = getRequiredString(body.value, "title", MAX_TITLE_LENGTH);

  if (!title.ok) {
    return title.response;
  }

  const summary = getRequiredString(body.value, "summary", MAX_SUMMARY_LENGTH);

  if (!summary.ok) {
    return summary.response;
  }

  const date = getOptionalString(body.value, "date") ?? new Date().toISOString().slice(0, 10);

  if (!DATE_PATTERN.test(date) || !isValidDateOnly(date)) {
    return jsonError(400, "invalid_date", "date must use YYYY-MM-DD format.", { field: "date" });
  }

  const taskKeyResult = getOptionalString(body.value, "taskKey");
  let taskKey: string | undefined;

  if (taskKeyResult !== undefined) {
    if (!TASK_KEY_PATTERN.test(taskKeyResult)) {
      return jsonError(400, "invalid_task_key", "taskKey must be a 16-character hex daily task key.", {
        field: "taskKey",
      });
    }

    taskKey = taskKeyResult;
  }

  const dsaSlug = getOptionalString(body.value, "dsaSlug");
  const url = getOptionalString(body.value, "url");
  const minutes = getOptionalInteger(body.value, "minutes", 30, 1, 600);

  if (!minutes.ok) {
    return minutes.response;
  }

  if (url !== undefined) {
    const validUrl = parseHttpUrl(url);

    if (!validUrl.ok) {
      return validUrl.response;
    }
  }

  const sql = createSqlClient();

  try {
    if (dsaSlug !== undefined) {
      const question = await getDsaQuestionBySlug(sql, dsaSlug);

      if (!question) {
        return jsonError(404, "dsa_question_not_found", `No DSA question exists for slug "${dsaSlug}".`, {
          field: "dsaSlug",
        });
      }
    }

    const sourceId = evidenceId(date, title.value, dsaSlug);
    const evidence: EvidenceItem = {
      id: sourceId,
      source: "manual",
      title: title.value,
      summary: summary.value,
      occurredAt: `${date}${DEFAULT_TIME}`,
      ...(url !== undefined ? { url } : {}),
      metadata: {
        date,
        ...(dsaSlug !== undefined ? { dsaSlug } : {}),
        ...(minutes.value !== undefined ? { minutes: minutes.value } : {}),
      },
    };

    await runInTransaction(sql, async (transaction: SqlClient) => {
      await upsertEvidenceItems(transaction, [evidence]);

      if (taskKey !== undefined) {
        const status: DailyTaskStatus = "completed";
        const task = await updateDailyTaskStatus(transaction, {
          date,
          taskKey,
          status,
          notes: `Auto-completed from manual evidence: ${title.value}`,
          evidenceUrl: url,
        });

        if (!task) {
          throw new Error("Daily task was not found.");
        }
      }
    });

    return jsonOk({ evidence });
  } catch (error) {
    return jsonError(503, "evidence_log_failed", "Manual evidence logging failed.", {
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await closeSqlClient(sql);
  }
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export function PUT() {
  return methodNotAllowed(["POST"]);
}

export function DELETE() {
  return methodNotAllowed(["POST"]);
}

function parseHttpUrl(value: string) {
  if (value.length > 2_048) {
    return {
      ok: false as const,
      response: jsonError(400, "field_too_long", "url is too long.", {
        field: "url",
        maxLength: 2_048,
      }),
    };
  }

  try {
    const parsed = new URL(value);

    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return { ok: true as const };
    }
  } catch {
    // Fall through to the validation error below.
  }

  return {
    ok: false as const,
    response: jsonError(400, "invalid_url", "url must be an http or https URL.", {
      field: "url",
    }),
  };
}
