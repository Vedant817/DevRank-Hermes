import styles from "./page.module.css";

const readinessScores = [
  { label: "DSA", value: 18 },
  { label: "Backend/API", value: 24 },
  { label: "System Design", value: 16 },
  { label: "GitHub Portfolio", value: 21 },
  { label: "AI Workflow", value: 19 },
];

const dataSources = [
  { name: "Supabase", status: "source of truth", state: "planned" },
  { name: "GitHub App", status: "repo and PR evidence", state: "planned" },
  { name: "Local Agent", status: "AI session summaries", state: "planned" },
  { name: "Hermes", status: "mentor workflows", state: "planned" },
  { name: "Slack", status: "daily targets", state: "planned" },
  { name: "Linear", status: "project execution", state: "optional" },
];

const planItems = [
  "Connect Supabase Postgres and pgvector.",
  "Backfill GitHub repositories and pull requests.",
  "Ingest local Codex, Claude, OpenCode, and Antigravity sessions.",
  "Generate the first evidence-backed SDE readiness snapshot.",
];

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DevRank OS</p>
          <h1>Engineering readiness command center</h1>
        </div>
        <div className={styles.summary}>
          <span>Hybrid local and cloud system</span>
          <strong>Foundation build</strong>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.panel} aria-labelledby="score-heading">
          <div className={styles.sectionHeader}>
            <p className={styles.kicker}>SDE readiness</p>
            <h2 id="score-heading">Baseline score lanes</h2>
          </div>
          <div className={styles.scoreGrid}>
            {readinessScores.map((score) => (
              <div className={styles.scoreItem} key={score.label}>
                <div className={styles.scoreLabel}>
                  <span>{score.label}</span>
                  <strong>{score.value}%</strong>
                </div>
                <div className={styles.track}>
                  <div
                    className={styles.fill}
                    style={{ width: `${score.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="sources-heading">
          <div className={styles.sectionHeader}>
            <p className={styles.kicker}>Evidence graph</p>
            <h2 id="sources-heading">Connected sources</h2>
          </div>
          <div className={styles.sourceList}>
            {dataSources.map((source) => (
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
            <p className={styles.kicker}>Next useful slice</p>
            <h2 id="plan-heading">MVP execution queue</h2>
          </div>
          <ol className={styles.planList}>
            {planItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
