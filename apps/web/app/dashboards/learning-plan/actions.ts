"use server";

import {
  closeSqlClient,
  createSqlClient,
  updateDailyTaskStatus,
  type DailyTaskStatus,
} from "@repo/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export type MarkTaskStatusResult = { ok: boolean; error?: string };

export async function markTaskStatus(
  planDate: string,
  taskKey: string,
  status: DailyTaskStatus,
): Promise<MarkTaskStatusResult> {
  const authError = await checkDashboardAuth();
  if (authError) return authError;

  if (
    typeof planDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(planDate) ||
    typeof taskKey !== "string" ||
    !/^[a-f0-9]{16}$/.test(taskKey) ||
    (status !== "completed" && status !== "skipped" && status !== "pending")
  ) {
    return { ok: false, error: "Invalid plan date, task key, or status." };
  }

  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    await updateDailyTaskStatus(sql, { date: planDate, taskKey, status });
    revalidatePath("/dashboards/learning-plan");

    return { ok: true };
  } catch {
    console.error("markTaskStatus failed to update daily task status.");

    return {
      ok: false,
      error: "Failed to update task status.",
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

const PLACEHOLDER_TOKEN_PATTERN = /change[-_]?me|replace[-_\s]?me/i;

async function checkDashboardAuth(): Promise<MarkTaskStatusResult | null> {
  const rawToken = process.env.DEVRANK_DASHBOARD_TOKEN?.trim()
    || process.env.DEVRANK_API_TOKEN?.trim();
  const expectedToken = rawToken !== undefined && !PLACEHOLDER_TOKEN_PATTERN.test(rawToken)
    ? rawToken
    : undefined;

  if (!expectedToken) {
    return { ok: false, error: "Dashboard requires authentication." };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard-token")?.value;

  if (token === undefined || !constantTimeEqual(token, expectedToken)) {
    return { ok: false, error: "Dashboard requires authentication." };
  }

  return null;
}

function constantTimeEqual(received: string, expected: string) {
  const length = Math.max(received.length, expected.length);
  let mismatch = received.length ^ expected.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return mismatch === 0;
}
