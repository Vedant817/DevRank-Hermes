"use client";

import { useRef, useState, type FormEvent } from "react";
import styles from "./trial.module.css";

type Lane = {
  label: string;
  score: number;
};

type TrialResult = {
  username: string;
  evidenceCount: number;
  snapshot: {
    overall: number;
    breakdown: Lane[];
  };
  weakestLanes: string[];
  note: string;
};

type ApiPayload = {
  ok: boolean;
  error?: { message?: string };
} & Partial<TrialResult>;

export function TrialScoreForm() {
  const [result, setResult] = useState<TrialResult>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const requestInFlight = useRef(false);

  async function scoreProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (requestInFlight.current) {
      return;
    }

    requestInFlight.current = true;
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();

    setPending(true);
    setError(undefined);

    try {
      const response = await fetch("/api/trial/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const payload = await response.json() as ApiPayload;

      if (!response.ok || !payload.ok || !isTrialResult(payload)) {
        setResult(undefined);
        setError(payload.error?.message ?? "The profile could not be scored. Try again shortly.");
        return;
      }

      setResult(payload);
    } catch {
      setResult(undefined);
      setError("The scoring service could not be reached. Check your connection and retry.");
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className={styles.diagnostic} aria-labelledby="diagnostic-heading">
      <div className={styles.terminalBar} aria-hidden="true">
        <span />
        <span />
        <span />
        <code>readiness.scan</code>
      </div>
      <div className={styles.diagnosticBody}>
        <h2 id="diagnostic-heading">Run your baseline</h2>
        <form className={styles.form} onSubmit={scoreProfile}>
          <label htmlFor="github-username">GitHub username</label>
          <div className={styles.inputRow}>
            <span aria-hidden="true">github.com/</span>
            <input
              id="github-username"
              name="username"
              type="text"
              autoComplete="username"
              minLength={1}
              maxLength={39}
              pattern="[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?"
              placeholder="octocat"
              required
              disabled={pending}
            />
          </div>
          <button type="submit" disabled={pending}>
            {pending ? "Inspecting public work..." : "Score my public work"}
          </button>
        </form>

        <div className={styles.status} aria-live="polite">
          {error ? <p className={styles.error}>{error}</p> : null}
          {result ? <TrialResultCard result={result} /> : (
            !error && !pending ? <p>Usually finishes in under 20 seconds.</p> : null
          )}
        </div>
      </div>
    </section>
  );
}

function TrialResultCard({ result }: { result: TrialResult }) {
  return (
    <div className={styles.result}>
      <div className={styles.resultHeadline}>
        <div>
          <span>@{result.username}</span>
          <strong>{result.snapshot.overall}<small>/100</small></strong>
        </div>
        <p>{result.evidenceCount} public evidence items found</p>
      </div>

      <div className={styles.lanes} aria-label="Readiness lane scores">
        {result.snapshot.breakdown.map((lane) => (
          <div className={styles.lane} key={lane.label}>
            <div><span>{lane.label}</span><strong>{lane.score}</strong></div>
            <div className={styles.track}><span style={{ width: `${lane.score}%` }} /></div>
          </div>
        ))}
      </div>

      <div className={styles.nextMoves}>
        <strong>Build proof here next</strong>
        <ul>{result.weakestLanes.map((lane) => <li key={lane}>{lane}</li>)}</ul>
      </div>
      <p className={styles.note}>{result.note}</p>
    </div>
  );
}

function isTrialResult(payload: ApiPayload): payload is ApiPayload & TrialResult {
  return typeof payload.username === "string"
    && typeof payload.evidenceCount === "number"
    && typeof payload.snapshot?.overall === "number"
    && payload.snapshot.overall >= 0
    && payload.snapshot.overall <= 100
    && Array.isArray(payload.snapshot.breakdown)
    && payload.snapshot.breakdown.every(isLane)
    && Array.isArray(payload.weakestLanes)
    && payload.weakestLanes.every((lane) => typeof lane === "string")
    && typeof payload.note === "string";
}

function isLane(value: unknown): value is Lane {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const lane = value as Partial<Lane>;
  return typeof lane.label === "string"
    && typeof lane.score === "number"
    && Number.isFinite(lane.score)
    && lane.score >= 0
    && lane.score <= 100;
}
