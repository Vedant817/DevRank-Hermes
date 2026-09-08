"use client";

import { useState, useTransition } from "react";
import { generateDailyMentor, type GenerateDailyMentorResult } from "./mentor-actions";
import type { DailyMentorBrief } from "./mentor-brief";
import styles from "../../page.module.css";

export function MentorPanel({ brief }: { brief: DailyMentorBrief }) {
  const [result, setResult] = useState<GenerateDailyMentorResult>();
  const [pending, startTransition] = useTransition();

  function askHermes() {
    setResult(undefined);
    startTransition(async () => setResult(await generateDailyMentor()));
  }

  return (
    <section className={styles.panel} aria-labelledby="mentor-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.kicker}>Daily mentor</p>
        <h2 id="mentor-heading">Evidence-first coaching</h2>
      </div>

      <ol className={styles.planList}>
        {brief.actions.map((action) => <li key={action}>{action}</li>)}
      </ol>

      {result?.ok && result.plan ? (
        <div className={styles.mentorPlan}>
          <p>{result.plan}</p>
          <small>Hermes via {result.provider} / {result.model}. Verify recommendations against linked evidence.</small>
        </div>
      ) : null}

      <div className={styles.mentorAction}>
        <button type="button" disabled={pending || !brief.scoreSummary} onClick={askHermes}>
          {pending ? "Hermes is reviewing..." : "Ask Hermes to refine this brief"}
        </button>
        <p aria-live="polite">
          {result?.error ?? (!brief.scoreSummary
            ? "A readiness snapshot is required for AI coaching. The deterministic brief still works."
            : `Optional AI enrichment. Aggregate lane scores${brief.snapshotGeneratedAt ? ` from ${brief.snapshotGeneratedAt.slice(0, 10)}` : ""} are sent to the configured external provider; your persisted plan remains authoritative.`)}
        </p>
      </div>
    </section>
  );
}
