import styles from "./page.module.css";

const runtimeParts = [
  {
    name: "Cloud web app",
    path: "apps/web",
    detail: "Dashboard, API routes, signed webhooks, score recomputation, cron jobs, and Slack delivery.",
  },
  {
    name: "Operator CLI",
    path: "apps/cli",
    detail: "Environment checks, migrations, backfills, local ingestion, scoring, planning, and diagnostics.",
  },
  {
    name: "Local agent",
    path: "apps/local-agent",
    detail: "macOS transcript discovery with redaction and local-first raw chat custody.",
  },
  {
    name: "Background worker",
    path: "apps/worker",
    detail: "Scheduled planning, weekly review, and market benchmark runners.",
  },
];

const runbooks = [
  {
    title: "Architecture",
    path: "docs/architecture.md",
    summary: "Hybrid local/cloud runtime, source of truth, and integration boundaries.",
  },
  {
    title: "Decision Diagram",
    path: "docs/architecture-decision-diagram.md",
    summary: "Mermaid system map for Local Mac, Vercel, Supabase, GitHub, Slack, and search.",
  },
  {
    title: "Scoring Rubric",
    path: "docs/scoring-rubric.md",
    summary: "Deterministic SDE-readiness lanes and score snapshot flow.",
  },
  {
    title: "Resume Evidence",
    path: "docs/resume-bullets.md",
    summary: "Evidence-backed positioning templates for later career/content output.",
  },
];

const gates = [
  "pnpm test",
  "pnpm run lint",
  "pnpm run build",
];

const dataStores = [
  "memory_items",
  "score_snapshots",
  "daily_plans",
  "ingestion_runs",
  "github_repos",
  "github_pull_requests",
  "linear_projects",
  "linear_issues",
  "slack_notifications",
];

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DevRank OS Docs</p>
          <h1>Production runbook for the engineering readiness system</h1>
        </div>
        <div className={styles.status}>
          <span>Source of truth</span>
          <strong>Supabase Postgres + pgvector</strong>
        </div>
      </header>

      <section className={styles.band} aria-labelledby="runtime-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Runtime map</p>
          <h2 id="runtime-heading">Services and ownership</h2>
        </div>
        <div className={styles.runtimeGrid}>
          {runtimeParts.map((part) => (
            <article className={styles.runtimeCard} key={part.path}>
              <div>
                <h3>{part.name}</h3>
                <code>{part.path}</code>
              </div>
              <p>{part.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.band} aria-labelledby="runbooks-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Runbooks</p>
          <h2 id="runbooks-heading">Repo documentation</h2>
        </div>
        <div className={styles.runbookGrid}>
          {runbooks.map((runbook) => (
            <article className={styles.runbookCard} key={runbook.path}>
              <div>
                <span>{runbook.title}</span>
                <code>{runbook.path}</code>
              </div>
              <p>{runbook.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.twoColumn} aria-label="Verification and data model">
        <div className={styles.block}>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>Verification</p>
            <h2>Required gates</h2>
          </div>
          <ol className={styles.commandList}>
            {gates.map((gate) => (
              <li key={gate}>
                <code>{gate}</code>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.block}>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>Canonical tables</p>
            <h2>Evidence and outputs</h2>
          </div>
          <ul className={styles.tagList}>
            {dataStores.map((table) => (
              <li key={table}>{table}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
