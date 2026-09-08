"use server";

import {
  closeSqlClient,
  createSqlClient,
  updateDailyTaskStatus,
  type DailyTaskStatus,
} from "@repo/db";
import { revalidatePath } from "next/cache";
import { isDashboardActionAuthorized } from "../../_lib/dashboard-auth";

export type MarkTaskStatusResult = { ok: boolean; error?: string };

export async function markTaskStatus(
  planDate: string,
  taskKey: string,
  status: DailyTaskStatus,
): Promise<MarkTaskStatusResult> {
  if (!await isDashboardActionAuthorized()) {
    return { ok: false, error: "Dashboard requires authentication." };
  }

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
    const task = await updateDailyTaskStatus(sql, { date: planDate, taskKey, status });

    if (!task) {
      return { ok: false, error: "Daily task was not found." };
    }
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
