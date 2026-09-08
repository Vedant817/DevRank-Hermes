import {
  closeSqlClient,
  createSqlClient,
  currentStreak,
  listDsaCompletions,
  listDsaQuestionBank,
  listScoringEvidence,
} from "@repo/db";
import { selectDailyDsaTargets } from "@repo/planner";
import { computeSdeReadinessSnapshot } from "@repo/scoring";
import type { DsaQuestion } from "@repo/shared";
import Link from "next/link";
import { DsaWorkbench } from "./workbench";
import styles from "./dsa.module.css";

export const dynamic = "force-dynamic";

type DsaState = {
  status: "ready";
  target?: DsaQuestion;
  dsaScore: number;
  solvedCount: number;
  streak: number;
  totalCount: number;
} | {
  status: "unavailable";
  message: string;
};

export default async function DsaDashboardPage() {
  const state = await loadDsaState();

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/dashboards">&lt;- Command center</Link>
        <span>Daily algorithm practice</span>
      </nav>

      {state.status === "unavailable" ? (
        <section className={styles.unavailable}>
          <p>DSA loop unavailable</p>
          <h1>Question bank not ready</h1>
          <span>{state.message}</span>
        </section>
      ) : (
        <>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>One problem. One proof. Every day.</p>
              <h1>Today&apos;s DSA rep</h1>
            </div>
            <div className={styles.metrics}>
              <Metric label="DSA score" value={`${state.dsaScore}/100`} />
              <Metric label="Solve streak" value={`${state.streak} days`} />
              <Metric label="Question bank" value={`${state.solvedCount}/${state.totalCount}`} />
            </div>
          </header>

          <DsaWorkbench target={state.target} />

          <aside className={styles.contract}>
            <strong>The proof contract</strong>
            <span>Opening a problem does nothing to your score.</span>
            <span>Recording a solve creates dated evidence and recomputes readiness atomically.</span>
          </aside>
        </>
      )}
    </main>
  );
}

async function loadDsaState(): Promise<DsaState> {
  let sql: ReturnType<typeof createSqlClient> | undefined;

  try {
    sql = createSqlClient();
    const [bank, completions, evidence] = await Promise.all([
      listDsaQuestionBank(sql),
      listDsaCompletions(sql),
      listScoringEvidence(sql),
    ]);
    const snapshot = computeSdeReadinessSnapshot(evidence);
    const completedSlugs = new Set(completions.map((completion) => completion.slug));
    const date = new Date().toISOString().slice(0, 10);
    const target = selectDailyDsaTargets(
      bank.filter((question) => !completedSlugs.has(question.slug)),
      { count: 1, date, dsaLaneScore: laneScore(snapshot, "DSA") },
    )[0];

    return {
      status: "ready",
      ...(target ? { target } : {}),
      dsaScore: laneScore(snapshot, "DSA"),
      solvedCount: completedSlugs.size,
      streak: currentStreak(new Set(completions.map((completion) => completion.date)), date),
      totalCount: bank.length,
    };
  } catch {
    return {
      status: "unavailable",
      message: "Run database migrations and verify the DSA question seed is available.",
    };
  } finally {
    if (sql) await closeSqlClient(sql);
  }
}

function laneScore(snapshot: ReturnType<typeof computeSdeReadinessSnapshot>, label: string) {
  return snapshot.breakdown.find((lane) => lane.label === label)?.score ?? 0;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
