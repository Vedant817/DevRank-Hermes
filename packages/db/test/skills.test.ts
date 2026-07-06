import assert from "node:assert/strict";
import test from "node:test";
import type { SqlClient } from "../src/client.js";
import { upsertSkillEvidence } from "../src/skills.js";

type SqlCall = {
  text: string;
  values: unknown[];
};

test("upserts skills by slug and evidence by skill/source identity", async () => {
  const { calls, sql } = recordingSql([{ id: "skill-1" }]);
  const written = await upsertSkillEvidence(sql, [{
    occurredAt: "2026-06-23T08:00:00.000Z",
    skillCategory: "quality",
    skillName: "Testing & QA",
    skillSlug: "testing",
    source: "github_pr",
    sourceId: "salescode/devrank-os#7",
    summary: "PR salescode/devrank-os#7 touched 2 Testing & QA file(s).",
    title: "Add webhook retry tests",
  }]);

  assert.equal(written, 1);
  assert.equal(calls.length, 2);

  const skillCall = calls[0];
  const evidenceCall = calls[1];

  assert.match(skillCall?.text ?? "", /insert into skills/);
  assert.match(skillCall?.text ?? "", /on conflict \(slug\) do update/);
  assert.deepEqual(skillCall?.values, ["testing", "Testing & QA", "quality"]);
  assert.match(evidenceCall?.text ?? "", /insert into skill_evidence/);
  assert.match(evidenceCall?.text ?? "", /on conflict \(skill_id, source, source_id\) do update/);
  assert.equal(evidenceCall?.values[0], "skill-1");
  assert.equal(evidenceCall?.values[2], "salescode/devrank-os#7");
});

test("writes nothing when no skill evidence is derived", async () => {
  const { calls, sql } = recordingSql();
  const written = await upsertSkillEvidence(sql, []);

  assert.equal(written, 0);
  assert.equal(calls.length, 0);
});

function recordingSql(result: unknown[] = []) {
  const calls: SqlCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({
      text: strings.join("?"),
      values,
    });

    return Promise.resolve(result);
  }) as unknown as SqlClient;

  return { calls, sql };
}
