import {
  closeSqlClient,
  createSqlClient,
  getDashboardSummary,
  type DashboardSummary,
} from "@repo/db";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type DashboardState =
  | { status: "ready"; summary: DashboardSummary }
  | { status: "unavailable"; message: string };

const setupPlanItems = [
  "Run database migrations against Supabase/Postgres.",
  "Ingest local AI-agent sessions or run GitHub and Linear backfills.",
  "Run score recomputation after evidence exists.",
  "Generate the daily plan after a score snapshot is stored.",
];

export default async function Home() {
  const dashboard = await loadDashboardState();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DevRank OS</p>
          <h1>Engineering readiness command center</h1>
        </div>
        <div className={styles.summary}>
          <span>Hybrid local and cloud system</span>
          <strong>{dashboard.status === "ready" ? "Live evidence graph" : "Setup required"}</strong>
        </div>
      </header>

      {dashboard.status === "unavailable" ? (
        <main className={styles.main}>
          <section className={styles.panel} aria-labelledby="unavailable-heading">
            <div className={styles.sectionHeader}>
              <p className={styles.kicker}>Dashboard status</p>
              <h2 id="unavailable-heading">Database unavailable</h2>
            </div>
            <p className={styles.emptyState}>{dashboard.message}</p>
          </section>
          <SetupPlan />
        </main>
      ) : (
        <Dashboard summary={dashboard.summary} />
      )}
    </div>
  );
}

async function loadDashboardState(): Promise<DashboardState> {
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    return {
      status: "ready",
      summary: await getDashboardSummary(sql),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "ConfigurationError"
        ? "Configure the database environment variables and run migrations before this dashboard can show live evidence."
        : "Database access failed. Verify Postgres is reachable and the DevRank migrations have been applied.";

    return {
      status: "unavailable",
      message,
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function Dashboard({ summary }: { summary: DashboardSummary }) {
  const scoreSnapshot = summary.latestScoreSnapshot;

  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="score-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>SDE readiness</p>
          <h2 id="score-heading">
            {scoreSnapshot ? `Overall ${scoreSnapshot.overall}%` : "No score snapshot yet"}
          </h2>
        </div>
        {scoreSnapshot ? (
          <div className={styles.scoreGrid}>
            {scoreSnapshot.breakdown.map((score) => (
              <div className={styles.scoreItem} key={score.label}>
                <div className={styles.scoreLabel}>
                  <span>{score.label}</span>
                  <strong>{score.score}%</strong>
                </div>
                <div className={styles.track}>
                  <div
                    className={styles.fill}
                    style={{ width: `${score.score}%` }}
                  />
                </div>
                <p className={styles.rowMeta}>
                  {score.explanation}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>
            Run `devrank scores:recompute` after evidence ingestion.
          </p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="sources-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Evidence graph</p>
          <h2 id="sources-heading">Connected sources</h2>
        </div>
        <div className={styles.sourceList}>
          {sourceRows(summary).map((source) => (
            <div className={styles.sourceRow} key={source.name}>
              <div>
                <strong>{source.name}</strong>
                <span>{source.status}</span>
              </div>
              <small>{source.state}</small>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="plan-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Daily plan</p>
          <h2 id="plan-heading">
            {summary.latestDailyPlan ? summary.latestDailyPlan.date : "No plan generated"}
          </h2>
        </div>
        {summary.latestDailyPlan ? (
          <ol className={styles.planList}>
            {summary.latestDailyPlan.tasks.map((task) => (
              <li key={`${task.category}-${task.title}`}>
                {task.title}{" "}
                <span className={styles.rowMeta}>({task.minutes} min)</span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <p className={styles.emptyState}>
              Generate the first daily plan after a score snapshot exists.
            </p>
            <SetupQueueList />
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="runs-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Operations</p>
          <h2 id="runs-heading">Recent ingestion runs</h2>
        </div>
        {summary.latestIngestionRuns.length > 0 ? (
          <div className={styles.sourceList}>
            {summary.latestIngestionRuns.map((run, index) => (
              <div
                className={styles.sourceRow}
                key={`${run.source}-${run.finishedAt ?? run.summary ?? run.status}-${index}`}
              >
                <div>
                  <strong>{run.source}</strong>
                  <span>
                    {run.summary ?? run.error ?? "No run details captured."}
                  </span>
                </div>
                <small>{run.status}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>
            No ingestion runs have been recorded yet.
          </p>
        )}
      </section>
    </main>
  );
}

function SetupPlan() {
  return (
    <section className={styles.panel} aria-labelledby="setup-heading">
      <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Next useful slice</p>
          <h2 id="setup-heading">Setup queue</h2>
        </div>
      <SetupQueueList />
    </section>
  );
}

function SetupQueueList() {
  return (
    <ol className={styles.planList}>
      {setupPlanItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

function sourceRows(summary: DashboardSummary) {
  const evidenceBySource = new Map(
    summary.evidenceBySource.map((item) => [item.source, item.count]),
  );
  const skillCount = evidenceBySource.get("skill") ?? 0;

  return [
    {
      name: "Supabase",
      status: `${summary.counts.evidenceItems} memory item(s)`,
      state: "connected",
    },
    {
      name: "GitHub",
      status: `${summary.counts.githubRepos} repo(s), ${summary.counts.githubPullRequests} PR(s)`,
      state:
        summary.counts.githubRepos > 0 || summary.counts.githubPullRequests > 0
          ? "synced"
          : "empty",
    },
    {
      name: "Local Agent",
      status: `${evidenceBySource.get("local_session") ?? 0} local session item(s)`,
      state: (evidenceBySource.get("local_session") ?? 0) > 0 ? "ingested" : "empty",
    },
    {
      name: "Hermes",
      status: `${skillCount} extracted skill item(s)`,
      state: skillCount > 0 ? "active" : "empty",
    },
    {
      name: "Slack",
      status: `${summary.counts.slackNotifications} notification(s)`,
      state: summary.counts.slackNotifications > 0 ? "sent" : "empty",
    },
    {
      name: "Linear",
      status: `${summary.counts.linearProjects} project(s), ${summary.counts.linearIssues} issue(s)`,
      state:
        summary.counts.linearProjects > 0 || summary.counts.linearIssues > 0
          ? "synced"
          : "empty",
    },
  ];
}
