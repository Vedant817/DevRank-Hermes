import {
  closeSqlClient,
  createSqlClient,
  getGithubPrReviewDashboard,
  type GithubPrReviewDashboard,
  type GithubPrReviewItem,
} from "@repo/db";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

type DashboardState =
  | { dashboard: GithubPrReviewDashboard; status: "ready" }
  | { message: string; status: "unavailable" };

export default async function PrReviewDashboardPage() {
  const state = await loadDashboardState();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Dashboard D</p>
          <h1>PR Review Dashboard</h1>
        </div>
        <div className={styles.summary}>
          <span>Metadata-only PR quality review</span>
          <strong>{state.status === "ready" ? "Live PR graph" : "Setup required"}</strong>
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
      dashboard: await getGithubPrReviewDashboard(sql),
      status: "ready",
    };
  } catch {
    return {
      message: "Database access failed. Verify Postgres is reachable and the GitHub PR metadata migration has been applied.",
      status: "unavailable",
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function Dashboard({ dashboard }: { dashboard: GithubPrReviewDashboard }) {
  const hasPullRequests = dashboard.totals.pullRequests > 0;

  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="summary-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Summary</p>
          <h2 id="summary-heading">{dashboard.totals.pullRequests} pull request(s)</h2>
        </div>
        {hasPullRequests ? (
          <PrRows pullRequests={dashboard.pullRequests} />
        ) : (
          <p className={styles.emptyState}>No pull request metadata has been imported yet.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="files-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Files changed</p>
          <h2 id="files-heading">{dashboard.totals.filesChanged} file signal(s)</h2>
        </div>
        <RankedRows
          emptyText="Run GitHub backfill with PR metadata enabled to import changed-file signals."
          rows={dashboard.pullRequests.map((item) => ({
            key: `${item.repoFullName}#${item.number}`,
            label: `${item.repoFullName}#${item.number}`,
            meta: item.topFiles.join(", ") || "No file metadata imported",
            value: item.filesChanged,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="classification-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Classification</p>
          <h2 id="classification-heading">PR type and complexity</h2>
        </div>
        <RankedRows
          emptyText="No PR metadata available to classify yet."
          rows={dashboard.pullRequests.map((item) => ({
            key: `${item.repoFullName}#${item.number}`,
            label: item.summary,
            meta: `${item.complexity} complexity | ${item.totalChanges} changed line(s), ${item.filesChanged} file(s)`,
            value: item.prType,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="risk-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Risk level</p>
          <h2 id="risk-heading">{dashboard.totals.highRiskPullRequests} high-risk PR(s)</h2>
        </div>
        <RankedRows
          emptyText="No risk signals available yet."
          rows={dashboard.pullRequests.map((item) => ({
            key: `${item.repoFullName}#${item.number}`,
            label: item.summary,
            meta: `${item.totalChanges} changed line(s), ${item.filesChanged} file(s)`,
            value: item.riskLevel,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="quality-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Quality</p>
          <h2 id="quality-heading">Tests, review, and merge status</h2>
        </div>
        <RankedRows
          emptyText="No quality signals available yet."
          rows={dashboard.pullRequests.map((item) => ({
            key: `${item.repoFullName}#${item.number}`,
            label: item.summary,
            meta: `${item.testQuality} tests | ${item.reviewState} | ${item.ciHealth} CI | ${item.mergeStatus}`,
            value: `${item.prQualityScore}%`,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="ci-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>CI health</p>
          <h2 id="ci-heading">
            {dashboard.totals.passingCiPullRequests} passing, {dashboard.totals.failingCiPullRequests} failing
          </h2>
        </div>
        <RankedRows
          emptyText="No GitHub check-run evidence has been imported yet."
          rows={dashboard.pullRequests.map((item) => ({
            key: `${item.repoFullName}#${item.number}`,
            label: item.summary,
            meta: item.ciSummary,
            value: item.ciHealth,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="review-comments-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Review comments</p>
          <h2 id="review-comments-heading">{dashboard.totals.reviews} review(s)</h2>
        </div>
        <RankedRows
          emptyText="No review metadata has been imported yet."
          rows={dashboard.pullRequests.map((item) => ({
            key: `${item.repoFullName}#${item.number}`,
            label: item.summary,
            meta: `${item.reviewState} review state`,
            value: item.reviewComments,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="review-timeline-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Review timeline</p>
          <h2 id="review-timeline-heading">Chronological review flow</h2>
        </div>
        <SignalRows
          emptyText="No chronological review timeline has been imported yet."
          rows={dashboard.pullRequests.flatMap((item) =>
            item.reviewTimeline.map((review, index) => ({
              key: `${item.repoFullName}#${item.number}-review-${review.id}`,
              label: `${index + 1}. ${review.state.toLowerCase()}`,
              meta: [
                item.summary,
                review.reviewerLogin ? `Reviewer: ${review.reviewerLogin}` : "Reviewer unknown",
                review.submittedAt ? `Submitted: ${formatTimestamp(review.submittedAt)}` : "Submission time unavailable",
                `${review.commentCount} comment(s)`,
              ].join(" | "),
              value: item.reviewState,
            })),
          )}
        />
      </section>

      <section className={styles.panel} aria-labelledby="architecture-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Architecture impact</p>
          <h2 id="architecture-heading">Design and code smell</h2>
        </div>
        <RankedRows
          emptyText="No architecture-impact metadata available yet."
          rows={dashboard.pullRequests.map((item) => ({
            key: `${item.repoFullName}#${item.number}`,
            label: item.summary,
            meta: `${item.architectureImpact} architecture impact`,
            value: `${item.codeSmellScore}`,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="security-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Security issues</p>
          <h2 id="security-heading">Security-sensitive change signals</h2>
        </div>
        <SignalRows
          emptyText="No security-sensitive PR file signals detected."
          rows={dashboard.pullRequests.flatMap((item) =>
            item.securityIssues.map((issue) => ({
              key: `${item.repoFullName}#${item.number}-${issue}`,
              label: issue,
              meta: item.summary,
              value: item.riskLevel,
            })),
          )}
        />
      </section>

      <section className={styles.panel} aria-labelledby="learning-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Learning extracted</p>
          <h2 id="learning-heading">Evidence and resume impact</h2>
        </div>
        <SignalRows
          emptyText="No learning signals have been extracted from PR metadata yet."
          rows={dashboard.pullRequests.flatMap((item) => [
            ...item.learningExtracted.map((signal) => ({
              key: `${item.repoFullName}#${item.number}-${signal}`,
              label: signal,
              meta: item.summary,
              value: item.testQuality,
            })),
            {
              key: `${item.repoFullName}#${item.number}-resume`,
              label: item.resumeWorthyImpact,
              meta: item.summary,
              value: item.mergeStatus,
            },
          ])}
        />
      </section>
    </main>
  );
}

function PrRows({ pullRequests }: { pullRequests: GithubPrReviewItem[] }) {
  return (
    <div className={styles.sourceList}>
      {pullRequests.map((item) => (
        <div className={styles.sourceRow} key={`${item.repoFullName}#${item.number}`}>
          <div>
            <strong>{item.summary}</strong>
            <span>
              {item.prType} | {item.complexity} complexity | {item.riskLevel} risk | {item.testQuality} tests | {item.reviewState} | {item.ciHealth} CI
            </span>
          </div>
          <small>{item.prQualityScore}%</small>
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

const SignalRows = RankedRows;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
