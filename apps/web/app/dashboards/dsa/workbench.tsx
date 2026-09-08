"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DsaQuestion } from "@repo/shared";
import { markDsaSolved, type MarkDsaSolvedResult } from "./actions";
import styles from "./dsa.module.css";

export function DsaWorkbench({ target }: { target?: DsaQuestion }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(30);
  const [result, setResult] = useState<MarkDsaSolvedResult>();
  const [pending, startTransition] = useTransition();

  function recordSolve() {
    if (!target) return;

    setResult(undefined);
    startTransition(async () => {
      const nextResult = await markDsaSolved(target.slug, minutes);
      setResult(nextResult);

      if (nextResult.ok) {
        router.refresh();
      }
    });
  }

  return (
    <>
      {result ? (
        <div className={styles.resultBanner} aria-live="polite" data-error={result.ok ? undefined : "true"}>
          {result.ok
            ? `${result.solvedTitle ?? "Solve"} recorded. DSA ${formatDelta(result.dsaDelta)}; overall ${formatDelta(result.overallDelta)}.`
            : result.error}
        </div>
      ) : null}
      {target ? (
        <section className={styles.workbench} aria-labelledby="question-title">
          <div className={styles.questionIndex} aria-hidden="true">NEXT<br />REP</div>
          <div className={styles.question}>
            <div className={styles.tags}>
              <span>{target.difficulty}</span>
              <span>{target.topic}</span>
            </div>
            <h2 id="question-title">{target.title}</h2>
            <p>Find the invariant first. Then implement, test edge cases, and state time and space complexity.</p>
            <div className={styles.patterns}>
              {target.patterns.map((pattern) => <code key={pattern}>{pattern}</code>)}
            </div>
            <a className={styles.openProblem} href={target.url} target="_blank" rel="noreferrer">
              Open problem -&gt;
            </a>
          </div>
          <div className={styles.solveAction}>
            <label>
              Minutes
              <input
                type="number"
                min={1}
                max={600}
                value={minutes}
                disabled={pending}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </label>
            <button type="button" disabled={pending} onClick={recordSolve}>
              {pending ? "Recording..." : "I solved it"}
            </button>
          </div>
        </section>
      ) : (
        <section className={styles.complete}>
          <p>Question bank complete</p>
          <h2>Every seeded problem has evidence.</h2>
          <span>Add a new migration with more questions to continue the loop.</span>
        </section>
      )}
    </>
  );
}

function formatDelta(value = 0) {
  return value === 0 ? "unchanged" : `${value > 0 ? "+" : ""}${value} pts`;
}
