import {
  closeSqlClient,
  createSqlClient,
  updateDailyTaskStatus,
  type DailyTaskStatus,
} from "@repo/db";
import {
  containsLikelySecretInJson,
  getOptionalString,
  getRequiredString,
  jsonError,
  jsonOk,
  methodNotAllowed,
  rateLimit,
  readJsonObject,
  requireApiAuth,
} from "../../_lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limitError = rateLimit(request, {
    key: "plan_task_completion",
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
    return jsonError(400, "secret_like_value", "Task completion updates cannot contain secrets or tokens.");
  }

  const date = getRequiredString(body.value, "date", 10);

  if (!date.ok) {
    return date.response;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    return jsonError(400, "invalid_date", "date must use YYYY-MM-DD format.", {
      field: "date",
    });
  }

  const taskKey = getRequiredString(body.value, "taskKey", 32);

  if (!taskKey.ok) {
    return taskKey.response;
  }

  if (!/^[a-f0-9]{16}$/.test(taskKey.value)) {
    return jsonError(400, "invalid_task_key", "taskKey must be a valid daily task key.", {
      field: "taskKey",
    });
  }

  const status = parseStatus(body.value.status, body.value.completed);

  if (!status.ok) {
    return status.response;
  }

  const notes = getOptionalString(body.value, "notes");

  if (notes && notes.length > 1_000) {
    return jsonError(400, "field_too_long", "notes is too long.", {
      field: "notes",
      maxLength: 1_000,
    });
  }

  const evidenceUrl = getOptionalString(body.value, "evidenceUrl");

  if (evidenceUrl) {
    const validUrl = parseHttpUrl(evidenceUrl);

    if (!validUrl.ok) {
      return validUrl.response;
    }
  }

  try {
    const sql = createSqlClient();

    try {
      const task = await updateDailyTaskStatus(sql, {
        date: date.value,
        taskKey: taskKey.value,
        status: status.value,
        notes,
        evidenceUrl,
      });

      if (!task) {
        return jsonError(404, "task_not_found", "No daily task exists for the provided date and taskKey.");
      }

      return jsonOk({ task });
    } finally {
      await closeSqlClient(sql);
    }
  } catch {
    return jsonError(503, "task_completion_failed", "Daily task completion update failed.");
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

function parseStatus(status: unknown, completed: unknown) {
  if (typeof status === "string") {
    const normalized = status.trim().toLowerCase();

    if (normalized === "pending" || normalized === "completed" || normalized === "skipped") {
      return { ok: true as const, value: normalized as DailyTaskStatus };
    }

    return {
      ok: false as const,
      response: jsonError(400, "invalid_status", "status must be pending, completed, or skipped.", {
        field: "status",
      }),
    };
  }

  if (completed === undefined) {
    return { ok: true as const, value: "completed" as DailyTaskStatus };
  }

  if (typeof completed !== "boolean") {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_completed", "completed must be a boolean when provided.", {
        field: "completed",
      }),
    };
  }

  return { ok: true as const, value: completed ? "completed" : "pending" as DailyTaskStatus };
}

function parseHttpUrl(value: string) {
  if (value.length > 2_048) {
    return {
      ok: false as const,
      response: jsonError(400, "field_too_long", "evidenceUrl is too long.", {
        field: "evidenceUrl",
        maxLength: 2_048,
      }),
    };
  }

  try {
    const url = new URL(value);

    if (url.protocol === "https:" || url.protocol === "http:") {
      return { ok: true as const };
    }
  } catch {
    // Return the normalized validation error below.
  }

  return {
    ok: false as const,
    response: jsonError(400, "invalid_evidence_url", "evidenceUrl must be an http or https URL.", {
      field: "evidenceUrl",
    }),
  };
}
