import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyMentorBrief, isFreshMentorSnapshot } from "../app/dashboards/learning-plan/mentor-brief";

const snapshot = {
  overall: 42,
  generatedAt: "2026-09-08T00:00:00.000Z",
  rubricVersion: "sde-readiness-v2",
  breakdown: [
    { label: "DSA", score: 20, weight: 0.2, evidenceCount: 1, explanation: "One solve." },
    { label: "Backend/API", score: 60, weight: 0.25, evidenceCount: 3, explanation: "Three items." },
  ],
};

test("builds deterministic coaching from pending tasks and weakest score lane", () => {
  const brief = buildDailyMentorBrief({
    planStatus: "current",
    snapshot,
    streakDays: 0,
    tasks: [{
      category: "dsa",
      evidence: "leetcode/two-sum",
      minutes: 30,
      status: "pending",
      title: "Solve Two Sum",
    }],
  });

  assert.deepEqual(brief.weakestLanes, ["DSA", "Backend/API"]);
  assert.match(brief.actions.join("\n"), /Solve Two Sum \(30 min\)/);
  assert.match(brief.actions.join("\n"), /Prioritize DSA/);
  assert.match(brief.actions.join("\n"), /start the execution streak/);
  assert.match(brief.scoreSummary ?? "", /Overall readiness: 42\/100/);
  assert.doesNotMatch(brief.scoreSummary ?? "", /leetcode\/two-sum/);
  assert.equal(brief.snapshotGeneratedAt, snapshot.generatedAt);
});

test("keeps a useful deterministic fallback without a score snapshot", () => {
  const brief = buildDailyMentorBrief({ planStatus: "missing", streakDays: 2, tasks: [] });

  assert.equal(brief.scoreSummary, undefined);
  assert.deepEqual(brief.weakestLanes, []);
  assert.deepEqual(brief.actions, ["Generate today's plan, then complete one evidence-producing task."]);
  assert.equal(brief.snapshotGeneratedAt, undefined);
});

test("does not coach from tasks in a stale plan", () => {
  const brief = buildDailyMentorBrief({
    planStatus: "stale",
    snapshot,
    streakDays: 2,
    tasks: [{ category: "backend", minutes: 45, status: "pending", title: "Old task" }],
  });

  assert.doesNotMatch(brief.actions.join("\n"), /Old task/);
  assert.match(brief.actions[0] ?? "", /Refresh today's stale plan/);
});

test("accepts only snapshots from the previous seven days", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  assert.equal(isFreshMentorSnapshot("2026-09-01T12:00:00.000Z", now), true);
  assert.equal(isFreshMentorSnapshot("2026-09-01T11:59:59.999Z", now), false);
  assert.equal(isFreshMentorSnapshot("2026-09-09T00:00:00.000Z", now), false);
  assert.equal(isFreshMentorSnapshot("not-a-date", now), false);
});
