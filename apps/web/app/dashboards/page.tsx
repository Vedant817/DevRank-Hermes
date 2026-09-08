import {
  closeSqlClient,
  createSqlClient,
  getDashboardSummary,
  getRecentScoreSnapshots,
  type DashboardSummary,
} from "@repo/db";
import { computeScoreTrend, type ScoreTrend } from "@repo/scoring";
import { ensureCurrentScoreSnapshot } from "../_lib/current-score";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

type DashboardState =
  | { scoreTrend?: ScoreTrend; status: "ready"; summary: DashboardSummary }
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
        <Dashboard scoreTrend={dashboard.scoreTrend} summary={dashboard.summary} />
      )}
    </div>
  );
}

async function loadDashboardState(): Promise<DashboardState> {
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    const summary = await getDashboardSummary(sql);
    const currentScore = await ensureCurrentScoreSnapshot(sql, summary.latestScoreSnapshot);
    const recentSnapshots = currentScore.snapshot
      ? await getRecentScoreSnapshots(sql)
      : [];
    const scoreTrend = currentScore.snapshot
      ? computeScoreTrend(currentScore.snapshot, recentSnapshots)
      : undefined;

    return {
      status: "ready",
      summary: {
        ...summary,
        latestScoreSnapshot: currentScore.snapshot,
      },
      ...(scoreTrend ? { scoreTrend } : {}),
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

function Dashboard({
  scoreTrend,
  summary,
}: {
  scoreTrend?: ScoreTrend;
  summary: DashboardSummary;
}) {
  const scoreSnapshot = summary.latestScoreSnapshot;
  const trendByLabel = new Map(
    scoreTrend?.lanes.map((lane) => [lane.label, lane]),
  );
  // Linear is an opt-in integration: hide its dashboard until backfill has
  // imported at least one project or issue, so new users never land on an
  // empty enterprise view.
  const hasLinearData = summary.counts.linearProjects > 0 || summary.counts.linearIssues > 0;
  const visibleDashboardLinks = dashboardLinks.filter(
    (link) => link.href !== "/dashboards/linear-projects" || hasLinearData,
  );

  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="score-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Dashboard A</p>
          <h2 id="score-heading">
            {scoreSnapshot ? `Skill Rank Dashboard - Overall ${scoreSnapshot.overall}%` : "No score snapshot yet"}
          </h2>
          {scoreSnapshot ? (
            <p className={styles.scoreTrendSummary}>
              {scoreTrend
                ? `${formatScoreChange(scoreTrend.overallChange)} overall since ${formatSnapshotDate(scoreTrend.previousGeneratedAt)}.`
                : "Baseline snapshot. A trend will appear after the next compatible score recomputation."}
            </p>
          ) : null}
        </div>
        {scoreSnapshot ? (
          <div className={styles.scoreGrid}>
            {scoreSnapshot.breakdown.map((score) => {
              const laneTrend = trendByLabel.get(score.label);

              return (
                <div className={styles.scoreItem} key={score.label}>
                  <div className={styles.scoreLabel}>
                    <span>{score.label}</span>
                    <div className={styles.scoreValue}>
                      <strong>{score.score}%</strong>
                      <span
                        className={styles.scoreChange}
                        data-state={scoreChangeState(laneTrend?.change)}
                      >
                        {laneTrend ? formatScoreChange(laneTrend.change) : "Baseline"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.track}>
                    <div
                      className={styles.fill}
                      style={{ width: `${score.score}%` }}
                    />
                  </div>
                  <p className={styles.rowMeta}>
                    {scoreMetadata(score)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyState}>
            Ingest evidence first; the dashboard will create a score snapshot from persisted evidence.
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

      <section className={styles.panel} aria-labelledby="dashboards-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Specialized dashboards</p>
          <h2 id="dashboards-heading">Live views</h2>
        </div>
        <div className={styles.sourceList}>
          {visibleDashboardLinks.map((link) => (
            <a className={styles.sourceRow} href={link.href} key={link.href}>
              <div>
                <strong>{link.title}</strong>
                <span>{link.description}</span>
              </div>
              <small>{link.label}</small>
            </a>
          ))}
        </div>
        {!hasLinearData ? (
          <p className={styles.emptyState}>
            Linear Projects is hidden until Linear backfill imports data. Connect Linear to enable project tracking (optional).
          </p>
        ) : null}
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

const dashboardLinks = [
  {
    href: "/dashboards/ai-agent-learning",
    label: "Dashboard B",
    title: "AI Agent Learning",
    description: "Agent usage, extracted skills, repeated errors, and best prompts.",
  },
  {
    href: "/dashboards/github-portfolio",
    label: "Dashboard C",
    title: "GitHub Portfolio",
    description: "Repository quality, README/tests/deployment gaps, and portfolio readiness.",
  },
  {
    href: "/dashboards/pr-review",
    label: "Dashboard D",
    title: "PR Review",
    description: "PR files, risk, test quality, review comments, and resume-worthy impact.",
  },
  {
    href: "/dashboards/learning-plan",
    label: "Dashboard E",
    title: "Daily/Weekly Learning Plan",
    description: "Today focus tasks, weekly goal, completion status, and streak.",
  },
  {
    href: "/dashboards/dsa",
    label: "Daily practice",
    title: "DSA Loop",
    description: "Next unsolved question, solve evidence, streak, and immediate score delta.",
  },
  {
    href: "/dashboards/career-content",
    label: "Dashboard F",
    title: "Career/Content",
    description: "Resume bullets, posts, portfolio copy, talking points, and weekly summaries.",
  },
  {
    href: "/dashboards/linear-projects",
    label: "Dashboard G",
    title: "Linear Projects",
    description: "Project health, blocked/stale issues, GitHub proof, and planning candidates.",
  },
];

function scoreMetadata(score: NonNullable<DashboardSummary["latestScoreSnapshot"]>["breakdown"][number]) {
  return `${Math.round(score.weight * 100)}% weight | ${score.evidenceCount} evidence item(s) | ${score.explanation}`;
}

function formatScoreChange(change: number) {
  if (change === 0) {
    return "No change";
  }

  return `${change > 0 ? "+" : ""}${change} pts`;
}

function scoreChangeState(change: number | undefined) {
  if (change === undefined) {
    return "baseline";
  }

  if (change > 0) {
    return "improved";
  }

  if (change < 0) {
    return "declined";
  }

  return "unchanged";
}

function formatSnapshotDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
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
      status: `${summary.counts.githubRepos} repo(s), ${summary.counts.githubPullRequests} PR(s), ${summary.counts.githubCommits} commit(s)`,
      state:
        summary.counts.githubRepos > 0 ||
          summary.counts.githubPullRequests > 0 ||
          summary.counts.githubCommits > 0
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
