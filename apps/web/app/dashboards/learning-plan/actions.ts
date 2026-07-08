"use server";

import {
  closeSqlClient,
  createSqlClient,
  updateDailyTaskStatus,
  type DailyTaskStatus,
} from "@repo/db";
import { revalidatePath } from "next/cache";

// TODO(security): This mutating action is CSRF-protected by Next.js, but the
// /dashboards/learning-plan route is currently public. Until the dashboard is
// behind an authenticated/private boundary (Vercel deployment protection or a
// shared-secret cookie), only ship this where the page cannot be reached by
// untrusted clients.

export type MarkTaskStatusResult = { ok: boolean; error?: string };

export async function markTaskStatus(
  planDate: string,
  taskKey: string,
  status: DailyTaskStatus,
): Promise<MarkTaskStatusResult> {
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
