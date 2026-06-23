import {
  closeSqlClient,
  createSqlClient,
  getLinearProjectDashboard,
  type LinearDashboardIssue,
  type LinearDashboardProject,
  type LinearProjectDashboard,
} from "@repo/db";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

type DashboardState =
  | { dashboard: LinearProjectDashboard; status: "ready" }
  | { message: string; status: "unavailable" };

export default async function LinearProjectDashboardPage() {
  const state = await loadDashboardState();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Dashboard G</p>
          <h1>Linear Project Dashboard</h1>
        </div>
        <div className={styles.summary}>
          <span>Project-wise execution health</span>
          <strong>{state.status === "ready" ? "Live Linear graph" : "Setup required"}</strong>
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
      dashboard: await getLinearProjectDashboard(sql),
      status: "ready",
    };
  } catch {
    return {
      message: "Database access failed. Verify Postgres is reachable and Linear project tables have been migrated.",
      status: "unavailable",
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function Dashboard({ dashboard }: { dashboard: LinearProjectDashboard }) {
  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="projects-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Projects by workspace/team</p>
          <h2 id="projects-heading">{dashboard.totals.projects} project(s)</h2>
        </div>
        {dashboard.projectGroups.length > 0 ? (
          <div className={styles.sourceList}>
            {dashboard.projectGroups.flatMap((group) =>
              group.projects.map((project) => (
                <ProjectRow
                  groupLabel={`${group.workspaceName} / ${group.teamName}`}
                  key={project.id}
                  project={project}
                />
              )),
            )}
          </div>
        ) : (
          <p className={styles.emptyState}>No Linear project data has been imported yet.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="health-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Issue health</p>
          <h2 id="health-heading">{dashboard.totals.issues} issue(s)</h2>
        </div>
        <div className={styles.sourceList}>
          <MetricRow label="Open" value={dashboard.totals.openIssues} />
          <MetricRow label="Done" value={dashboard.totals.doneIssues} />
          <MetricRow label="Blocked" value={dashboard.totals.blockedIssues} />
          <MetricRow label="Stale" value={dashboard.totals.staleIssues} />
          <MetricRow label="Unowned" value={dashboard.totals.unownedIssues} />
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="priority-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Priority distribution</p>
          <h2 id="priority-heading">{dashboard.totals.highPriorityIssues} high-priority issue(s)</h2>
        </div>
        <div className={styles.sourceList}>
          {dashboard.priorityDistribution.length > 0 ? (
            dashboard.priorityDistribution.map((item) => (
              <MetricRow
                key={item.priority}
                label={`${item.priority}: ${item.label}`}
                value={item.count}
              />
            ))
          ) : (
            <p className={styles.emptyState}>No Linear issue priority data has been imported yet.</p>
          )}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="cycle-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Cycle progress</p>
          <h2 id="cycle-heading">Project progress from Linear</h2>
        </div>
        <div className={styles.scoreGrid}>
          {dashboard.cycleProgress.length > 0 ? (
            dashboard.cycleProgress.map((project) => (
              <div className={styles.scoreItem} key={project.projectId}>
                <div className={styles.scoreLabel}>
                  <span>{project.projectName}</span>
                  <strong>{project.progress === null ? "missing" : `${Math.round(project.progress)}%`}</strong>
                </div>
                <div className={styles.track} aria-hidden="true">
                  <div className={styles.fill} style={{ width: `${project.progress ?? 0}%` }} />
                </div>
                <p className={styles.rowMeta}>
                  {project.state === "tracked"
                    ? "Using Linear project progress because cycle sync is not enabled yet."
                    : "Linear project progress is not available for this project."}
                </p>
              </div>
            ))
          ) : (
            <p className={styles.emptyState}>No Linear project progress has been imported yet.</p>
          )}
        </div>
      </section>

      <IssuePanel
        emptyText="No blocked Linear issues detected."
        heading="Blocked issues"
        id="blocked-heading"
        issues={dashboard.blockedIssues}
      />

      <IssuePanel
        emptyText="No stale Linear issues detected."
        heading="Stale issues"
        id="stale-heading"
        issues={dashboard.staleIssues}
      />

      <IssuePanel
        emptyText="No project work currently needs today's plan."
        heading="Today's project candidates"
        id="planning-heading"
        issues={dashboard.planningCandidates}
      />

      <IssuePanel
        emptyText="Every imported issue has GitHub proof or there is no eligible issue yet."
        heading="Issues missing GitHub proof"
        id="missing-proof-heading"
        issues={dashboard.issuesMissingGithubProof}
      />

      <section className={styles.panel} aria-labelledby="proof-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>GitHub proof</p>
          <h2 id="proof-heading">{dashboard.totals.resumeWorthyCompletedIssues} resume-worthy completed issue(s)</h2>
        </div>
        {dashboard.resumeWorthyCompletedIssues.length > 0 ? (
          <div className={styles.sourceList}>
            {dashboard.resumeWorthyCompletedIssues.map(({ issue, proof }) => (
              <div className={styles.sourceRow} key={issue.id}>
                <div>
                  <strong>{issue.identifier}: {issue.title}</strong>
                  <span>
                    {proof.map((item) => `${item.repoFullName}#${item.number}`).join(", ")}
                  </span>
                </div>
                <small>{issue.projectName}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>No completed Linear issue has imported GitHub PR proof yet.</p>
        )}
      </section>
    </main>
  );
}

function ProjectRow({
  groupLabel,
  project,
}: {
  groupLabel: string;
  project: LinearDashboardProject;
}) {
  return (
    <div className={styles.sourceRow}>
      <div>
        <strong>{project.name}</strong>
        <span>
          {groupLabel} | {project.openIssues} open, {project.doneIssues} done, {project.blockedIssues} blocked, {project.staleIssues} stale
        </span>
      </div>
      <small>{project.progress === null ? "no progress" : `${Math.round(project.progress)}%`}</small>
    </div>
  );
}

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={styles.sourceRow}>
      <div>
        <strong>{label}</strong>
        <span>Linear issue count</span>
      </div>
      <small>{value}</small>
    </div>
  );
}

function IssuePanel({
  emptyText,
  heading,
  id,
  issues,
}: {
  emptyText: string;
  heading: string;
  id: string;
  issues: LinearDashboardIssue[];
}) {
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.sectionHeader}>
        <p className={styles.kicker}>Project work</p>
        <h2 id={id}>{heading}</h2>
      </div>
      {issues.length > 0 ? (
        <div className={styles.sourceList}>
          {issues.map((issue) => (
            <div className={styles.sourceRow} key={issue.id}>
              <div>
                <strong>{issue.identifier}: {issue.title}</strong>
                <span>
                  {issue.projectName} | {issue.priorityLabel} priority | {issue.assignee ?? "unassigned"}
                </span>
              </div>
              <small>{issue.hasGithubProof ? "PR proof" : "no proof"}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>{emptyText}</p>
      )}
    </section>
  );
}
