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
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update task status.",
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

async function checkDashboardAuth(): Promise<MarkTaskStatusResult | null> {
  const expectedToken = process.env.DEVRANK_DASHBOARD_TOKEN?.trim();

  if (!expectedToken) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard-token")?.value;

  if (token !== expectedToken) {
    return { ok: false, error: "Dashboard requires authentication." };
  }

  return null;
}
