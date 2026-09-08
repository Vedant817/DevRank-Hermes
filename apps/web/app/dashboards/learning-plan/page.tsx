import {
  closeSqlClient,
  createSqlClient,
  getLatestScoreSnapshotForOwner,
  getLearningPlanDashboard,
  type DailyTaskRecord,
  type LearningPlanDashboard,
} from "@repo/db";
import { resolveSingleUserOwner, type WeeklyPlanDay, type WeeklyPlanTask } from "@repo/shared";
import styles from "../../page.module.css";
import { buildDailyMentorBrief, type DailyMentorBrief } from "./mentor-brief";
import { MentorPanel } from "./mentor-panel";
import { TaskActionButtons } from "./task-actions";

export const dynamic = "force-dynamic";

const weekDays: WeeklyPlanDay[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type DashboardState =
  | { dashboard: LearningPlanDashboard; mentorBrief: DailyMentorBrief; status: "ready" }
  | { message: string; status: "unavailable" };

export default async function LearningPlanDashboardPage() {
  const state = await loadDashboardState();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Dashboard E</p>
          <h1>Daily/Weekly Learning Plan Dashboard</h1>
        </div>
        <div className={styles.summary}>
          <span>Plan completion and streaks</span>
          <strong>{state.status === "ready" ? "Live planner graph" : "Setup required"}</strong>
        </div>
      </header>

      {state.status === "unavailable" ? (
        <main className={styles.main}>
          <section className={styles.panel} aria-labelledby="unavailable-heading">
            <div className={styles.sectionHeader}>
              <p className={styles.kicker}>Dashboard status</p>
              <h2 id="unavailable-heading">Database unavailable</h2>
            </div>
            <p className={styles.emptyState}>{state.message}</p>
          </section>
        </main>
      ) : (
        <Dashboard dashboard={state.dashboard} mentorBrief={state.mentorBrief} />
      )}
    </div>
  );
}

async function loadDashboardState(): Promise<DashboardState> {
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    const ownerId = resolveSingleUserOwner().id;
    const [dashboard, snapshot] = await Promise.all([
      getLearningPlanDashboard(sql),
      getLatestScoreSnapshotForOwner(sql, ownerId),
    ]);

    return {
      dashboard,
      mentorBrief: buildDailyMentorBrief({
        ...(snapshot ? { snapshot } : {}),
        planStatus: dashboard.dailyPlan?.freshness ?? "missing",
        streakDays: dashboard.streak.currentDays,
        tasks: dashboard.tasks,
      }),
      status: "ready",
    };
  } catch {
    return {
      message: "Database access failed. Verify Postgres is reachable and the learning plan tracking migration has been applied.",
      status: "unavailable",
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function Dashboard({
  dashboard,
  mentorBrief,
}: {
  dashboard: LearningPlanDashboard;
  mentorBrief: DailyMentorBrief;
}) {
  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="today-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Today</p>
          <h2 id="today-heading">
            {dashboard.dailyPlan ? formatDate(dashboard.dailyPlan.date) : "No daily plan"}
          </h2>
        </div>
        {dashboard.dailyPlan ? (
          <div className={styles.sourceList}>
            <FocusRow title="DSA questions" tasks={dashboard.focus.dsa} />
            <FocusRow title="Backend task" tasks={dashboard.focus.backend} />
            <FocusRow title="System design topic" tasks={dashboard.focus.systemDesign} />
            <FocusRow title="GitHub/portfolio task" tasks={dashboard.focus.githubPortfolio} />
            <FocusRow title="AI-agent/orchestration task" tasks={dashboard.focus.aiAgent} />
          </div>
        ) : (
          <p className={styles.emptyState}>No daily plan has been generated yet.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="completion-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Completion status</p>
          <h2 id="completion-heading">{dashboard.completion.statusLabel}</h2>
        </div>
        <div className={styles.scoreGrid}>
          <div className={styles.scoreItem}>
            <div className={styles.scoreLabel}>
              <span>{dashboard.completion.percent}% complete</span>
              <strong>
                {dashboard.completion.completedTasks}/{dashboard.completion.totalTasks}
              </strong>
            </div>
            <div className={styles.track} aria-hidden="true">
              <div className={styles.fill} style={{ width: `${dashboard.completion.percent}%` }} />
            </div>
          </div>
          <p className={styles.emptyState}>
            {dashboard.dailyPlan?.freshness === "stale"
              ? "The latest persisted daily plan is stale. Run the daily plan cron to refresh today's plan."
              : "Completion is based on persisted daily task status rows."}
          </p>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="streak-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Streak</p>
          <h2 id="streak-heading">{dashboard.streak.currentDays} day(s)</h2>
        </div>
        <p className={styles.emptyState}>
          {dashboard.streak.lastCompletedDate
            ? `Last completed task date: ${formatDate(dashboard.streak.lastCompletedDate)}.`
            : "No completed daily tasks have been recorded yet."}
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="weekly-goal-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Weekly goal</p>
          <h2 id="weekly-goal-heading">
            {dashboard.weeklyPlan ? formatDate(dashboard.weeklyPlan.weekStart) : "No weekly plan"}
          </h2>
        </div>
        {dashboard.weeklyPlan ? (
          <>
            <p className={styles.emptyState}>{dashboard.weeklyPlan.weeklyGoal}</p>
            <ol className={styles.planList}>
              {weekDays.map((day) => (
                <li key={day}>
                  <strong>{day}</strong>
                  <p className={styles.rowMeta}>
                    {weeklyTasksForDay(dashboard.weeklyPlan?.tasks ?? [], day)
                      .map((task) => `${task.title} (${task.minutes} min)`)
                      .join(" | ")}
                  </p>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className={styles.emptyState}>No weekly plan has been generated yet.</p>
        )}
      </section>
      <MentorPanel key={mentorBrief.revision} brief={mentorBrief} />
    </main>
  );
}

function FocusRow({
  tasks,
  title,
}: {
  tasks: DailyTaskRecord[];
  title: string;
}) {
  const primary = tasks[0];

  return (
    <div className={styles.sourceRow}>
      <div>
        <strong>{title}</strong>
        <span>{primary ? primary.title : "No task planned for this lane."}</span>
      </div>
      <small>{primary ? taskStatusLabel(primary) : "missing"}</small>
      {primary ? (
        <TaskActionButtons
          planDate={primary.planDate}
          taskKey={primary.taskKey}
          status={primary.status}
        />
      ) : null}
    </div>
  );
}

function weeklyTasksForDay(tasks: WeeklyPlanTask[], day: WeeklyPlanDay): WeeklyPlanTask[] {
  return tasks.filter((task) => task.day === day);
}

function taskStatusLabel(task: DailyTaskRecord): string {
  if (task.status === "completed") {
    return task.completedAt ? `completed ${formatDate(task.completedAt)}` : "completed";
  }

  return task.status;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
