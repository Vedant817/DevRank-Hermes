import { TrialScoreForm } from "./trial-score-form";
import Link from "next/link";
import styles from "./trial.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <Link className={styles.brand} href="/">DevRank <span>OS</span></Link>
        <Link className={styles.dashboardLink} href="/dashboards">Open private dashboard</Link>
      </nav>

      <section className={styles.hero} aria-labelledby="trial-heading">
        <div className={styles.pitch}>
          <p className={styles.eyebrow}>Public GitHub diagnostic</p>
          <h1 id="trial-heading">Your repos already tell an engineering story.</h1>
          <p className={styles.lede}>
            Enter a GitHub username. DevRank inspects up to five public repositories and
            returns a deterministic SDE-readiness baseline. No account, no portfolio data
            stored, no AI guesswork.
          </p>
          <ol className={styles.process} aria-label="How trial scoring works">
            <li><strong>Inspect</strong><span>Recent commits and pull requests</span></li>
            <li><strong>Score</strong><span>Seven evidence-weighted lanes</span></li>
            <li><strong>Act</strong><span>Your three weakest areas first</span></li>
          </ol>
        </div>

        <TrialScoreForm />
      </section>

      <footer className={styles.footer}>
        <span>Read-only public data</span>
        <span>Deterministic rubric</span>
        <span>Built for early-career SDEs</span>
      </footer>
    </main>
  );
}
