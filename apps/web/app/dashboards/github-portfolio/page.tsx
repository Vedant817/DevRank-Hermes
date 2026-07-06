import {
  closeSqlClient,
  createSqlClient,
  getGithubPortfolioDashboard,
  type GithubPortfolioDashboard,
  type GithubPortfolioRepo,
} from "@repo/db";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

type DashboardState =
  | { dashboard: GithubPortfolioDashboard; status: "ready" }
  | { message: string; status: "unavailable" };

export default async function GithubPortfolioDashboardPage() {
  const state = await loadDashboardState();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Dashboard C</p>
          <h1>GitHub Portfolio Dashboard</h1>
        </div>
        <div className={styles.summary}>
          <span>Repository evidence and portfolio gaps</span>
          <strong>{state.status === "ready" ? "Live GitHub graph" : "Setup required"}</strong>
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
        <Dashboard dashboard={state.dashboard} />
      )}
    </div>
  );
}

async function loadDashboardState(): Promise<DashboardState> {
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    return {
      dashboard: await getGithubPortfolioDashboard(sql),
      status: "ready",
    };
  } catch {
    return {
      message: "Database access failed. Verify Postgres is reachable and the GitHub profile migration has been applied.",
      status: "unavailable",
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function Dashboard({ dashboard }: { dashboard: GithubPortfolioDashboard }) {
  const hasRepos = dashboard.totals.repos > 0;

  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="best-repos-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Best repos</p>
          <h2 id="best-repos-heading">{dashboard.totals.repos} repo(s) tracked</h2>
        </div>
        {hasRepos ? (
          <RepoRows repos={dashboard.bestRepos} />
        ) : (
          <p className={styles.emptyState}>No GitHub repositories have been imported yet.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="weak-repos-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Weak repos</p>
          <h2 id="weak-repos-heading">{dashboard.totals.profiledRepos} profiled repo(s)</h2>
        </div>
        <RepoRows
          emptyText="Run GitHub backfill with contents access to profile repository gaps."
          repos={dashboard.weakRepos}
        />
      </section>

      <GapPanel
        heading="Repos needing README"
        id="readme-heading"
        repos={dashboard.needsReadme}
      />

      <GapPanel
        heading="Repos needing tests"
        id="tests-heading"
        repos={dashboard.needsTests}
      />

      <GapPanel
        heading="Repos needing deployment"
        id="deployment-heading"
        repos={dashboard.needsDeployment}
      />

      <GapPanel
        heading="Repos needing architecture diagram"
        id="architecture-heading"
        repos={dashboard.needsArchitectureDiagram}
      />

      <section className={styles.panel} aria-labelledby="stack-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Tech stack</p>
          <h2 id="stack-heading">{dashboard.techStackDistribution.length} technology signal(s)</h2>
        </div>
        <RankedRows
          emptyText="No language or repository profile technology data has been imported yet."
          rows={dashboard.techStackDistribution.map((item) => ({
            key: item.technology,
            label: item.technology,
            meta: `${item.count} repo(s)`,
            value: item.count,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="commit-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Commit consistency</p>
          <h2 id="commit-heading">{dashboard.totals.commits} commit(s)</h2>
        </div>
        <RankedRows
          emptyText="No commit evidence has been imported yet."
          rows={dashboard.commitConsistency.map((item) => ({
            key: item.repoFullName,
            label: item.repoFullName,
            meta: `${item.commitsLast30Days} in 30d, ${item.commitsLast90Days} in 90d`,
            value: item.status,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="pr-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>PR quality</p>
          <h2 id="pr-heading">{dashboard.totals.pullRequests} pull request(s)</h2>
        </div>
        <RankedRows
          emptyText="No pull request evidence has been imported yet."
          rows={dashboard.prQuality.map((item) => ({
            key: item.repoFullName,
            label: item.repoFullName,
            meta: `${item.mergedPullRequests} merged, ${item.openPullRequests} open`,
            value: `${item.score}%`,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="complexity-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Project complexity</p>
          <h2 id="complexity-heading">{dashboard.projectComplexity.length} repo(s)</h2>
        </div>
        <RankedRows
          emptyText="No repository complexity signals have been imported yet."
          rows={dashboard.projectComplexity.map((item) => ({
            key: item.repoFullName,
            label: item.repoFullName,
            meta: item.signals.join(", ") || "No complexity signals yet",
            value: item.band,
          }))}
        />
      </section>
    </main>
  );
}

function GapPanel({
  heading,
  id,
  repos,
}: {
  heading: string;
  id: string;
  repos: GithubPortfolioRepo[];
}) {
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.sectionHeader}>
        <p className={styles.kicker}>Portfolio gaps</p>
        <h2 id={id}>{heading}</h2>
      </div>
      <RepoRows
        emptyText="No scanned repository currently has this gap."
        repos={repos}
      />
    </section>
  );
}

function RepoRows({
  emptyText = "No repository evidence available.",
  repos,
}: {
  emptyText?: string;
  repos: GithubPortfolioRepo[];
}) {
  if (repos.length === 0) {
    return <p className={styles.emptyState}>{emptyText}</p>;
  }

  return (
    <div className={styles.sourceList}>
      {repos.map((repo) => (
        <div className={styles.sourceRow} key={repo.fullName}>
          <div>
            <strong>{repo.fullName}</strong>
            <span>
              {[...repo.statusLabels.slice(0, 2), ...repo.reasons.slice(0, 2)].join(" ")}
            </span>
          </div>
          <small>{repo.portfolioScore}%</small>
        </div>
      ))}
    </div>
  );
}

function RankedRows({
  emptyText,
  rows,
}: {
  emptyText: string;
  rows: Array<{
    key: string;
    label: string;
    meta: string;
    value: number | string;
  }>;
}) {
  if (rows.length === 0) {
    return <p className={styles.emptyState}>{emptyText}</p>;
  }

  return (
    <div className={styles.sourceList}>
      {rows.map((row) => (
        <div className={styles.sourceRow} key={row.key}>
          <div>
            <strong>{row.label}</strong>
            <span>{row.meta}</span>
          </div>
          <small>{row.value}</small>
        </div>
      ))}
    </div>
  );
}
