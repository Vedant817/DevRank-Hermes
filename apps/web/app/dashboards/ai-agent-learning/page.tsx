import {
  closeSqlClient,
  createSqlClient,
  getAiAgentLearningDashboard,
  type AiAgentLearningDashboard,
} from "@repo/db";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

type DashboardState =
  | { dashboard: AiAgentLearningDashboard; status: "ready" }
  | { message: string; status: "unavailable" };

export default async function AiAgentLearningDashboardPage() {
  const state = await loadDashboardState();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Dashboard B</p>
          <h1>AI Agent Learning Dashboard</h1>
        </div>
        <div className={styles.summary}>
          <span>Evidence-backed AI usage</span>
          <strong>{state.status === "ready" ? "Live learning graph" : "Setup required"}</strong>
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
      dashboard: await getAiAgentLearningDashboard(sql),
      status: "ready",
    };
  } catch {
    return {
      message: "Database access failed. Verify Postgres is reachable and migrations have been applied.",
      status: "unavailable",
    };
  } finally {
    if (sql) {
      await closeSqlClient(sql);
    }
  }
}

function Dashboard({ dashboard }: { dashboard: AiAgentLearningDashboard }) {
  const hasEvidence = dashboard.totals.evidenceItems > 0 || dashboard.totals.sessions > 0;

  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="agents-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Agent usage</p>
          <h2 id="agents-heading">{dashboard.totals.sessions} session(s)</h2>
        </div>
        {hasEvidence ? (
          <div className={styles.sourceList}>
            {dashboard.agentUsage.map((agent) => (
              <div className={styles.sourceRow} key={agent.agentName}>
                <div>
                  <strong>{agent.agentName}</strong>
                  <span>
                    {agent.evidenceItems} evidence item(s), {agent.messages} message(s)
                  </span>
                </div>
                <small>{agent.lastSeenAt ? formatDate(agent.lastSeenAt) : "no timestamp"}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>No AI-agent evidence has been ingested yet.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="task-types-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Task types</p>
          <h2 id="task-types-heading">{dashboard.taskTypes.length} tag(s)</h2>
        </div>
        <RankedRows
          emptyText="No task tags have been extracted yet."
          rows={dashboard.taskTypes.map((item) => ({
            key: item.tag,
            label: item.tag,
            meta: `${item.count} evidence item(s)`,
            value: item.count,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="sources-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Sources</p>
          <h2 id="sources-heading">{dashboard.totals.sources} source(s)</h2>
        </div>
        <RankedRows
          emptyText="No local, cloud, manual, or workspace evidence has been stored yet."
          rows={dashboard.sourceBreakdown.map((item) => ({
            key: item.source,
            label: sourceLabel(item.source),
            meta: item.source,
            value: item.count,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="dependency-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Dependency signals</p>
          <h2 id="dependency-heading">{dashboard.aiDependencyWarnings.length} warning(s)</h2>
        </div>
        <SignalRows
          emptyText="No AI-dependency warnings detected from stored evidence."
          signals={dashboard.aiDependencyWarnings}
        />
      </section>

      <section className={styles.panel} aria-labelledby="improvement-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Improvement</p>
          <h2 id="improvement-heading">{dashboard.improvementSignals.length} signal(s)</h2>
        </div>
        <SignalRows
          emptyText="No improvement signals have been extracted yet."
          signals={dashboard.improvementSignals}
        />
      </section>

      <section className={styles.panel} aria-labelledby="errors-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Repeated bugs</p>
          <h2 id="errors-heading">{dashboard.repeatedErrors.length} item(s)</h2>
        </div>
        <SignalRows
          emptyText="No repeated errors or bug signals found in stored evidence."
          signals={dashboard.repeatedErrors}
        />
      </section>

      <section className={styles.panel} aria-labelledby="prompts-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Best prompts</p>
          <h2 id="prompts-heading">{dashboard.bestPrompts.length} prompt(s)</h2>
        </div>
        {dashboard.bestPrompts.length > 0 ? (
          <ol className={styles.planList}>
            {dashboard.bestPrompts.map((prompt) => (
              <li key={`${prompt.agentName}-${prompt.title}-${prompt.prompt}`}>
                {prompt.prompt}
                <p className={styles.rowMeta}>
                  {prompt.agentName} | confidence {Math.round(prompt.confidenceScore * 100)}% | {prompt.title}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.emptyState}>No prompts with confidence metadata have been stored yet.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="skills-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.kicker}>Reusable skills</p>
          <h2 id="skills-heading">{dashboard.totals.reusableSkills} skill artifact(s)</h2>
        </div>
        {dashboard.reusableSkills.length > 0 ? (
          <div className={styles.sourceList}>
            {dashboard.reusableSkills.map((skill) => (
              <div className={styles.sourceRow} key={`${skill.createdAt}-${skill.title}`}>
                <div>
                  <strong>{skill.title}</strong>
                  <span>{skill.summary}</span>
                </div>
                <small>{skill.skillTags.slice(0, 3).join(", ") || formatDate(skill.createdAt)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>No reusable skill artifacts have been created yet.</p>
        )}
      </section>
    </main>
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
    value: number;
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

function SignalRows({
  emptyText,
  signals,
}: {
  emptyText: string;
  signals: AiAgentLearningDashboard["aiDependencyWarnings"];
}) {
  if (signals.length === 0) {
    return <p className={styles.emptyState}>{emptyText}</p>;
  }

  return (
    <div className={styles.sourceList}>
      {signals.map((signal, index) => (
        <div className={styles.sourceRow} key={`${signal.agentName}-${signal.title}-${signal.signal}-${index}`}>
          <div>
            <strong>{signal.signal}</strong>
            <span>
              {signal.agentName} | {signal.title}
            </span>
          </div>
          <small>{sourceLabel(signal.source)}</small>
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function sourceLabel(source: string) {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
