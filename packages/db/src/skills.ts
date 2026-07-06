import type { SqlClient } from "./client.js";

export interface SkillEvidenceInput {
  occurredAt?: string | null;
  skillCategory?: string | null;
  skillName: string;
  skillSlug: string;
  source: string;
  sourceId: string;
  summary: string;
  title: string;
}

export async function upsertSkillEvidence(
  sql: SqlClient,
  items: SkillEvidenceInput[],
): Promise<number> {
  let written = 0;

  for (const item of items) {
    const [skill] = await sql<{ id: string }[]>`
      insert into skills (slug, name, category)
      values (${item.skillSlug}, ${item.skillName}, ${item.skillCategory ?? null})
      on conflict (slug) do update set
        name = excluded.name,
        category = coalesce(excluded.category, skills.category)
      returning id
    `;

    if (!skill) {
      continue;
    }

    await sql`
      insert into skill_evidence (skill_id, source, source_id, title, summary, occurred_at)
      values (
        ${skill.id},
        ${item.source},
        ${item.sourceId},
        ${item.title},
        ${item.summary},
        ${item.occurredAt ?? null}
      )
      on conflict (skill_id, source, source_id) do update set
        title = excluded.title,
        summary = excluded.summary,
        occurred_at = coalesce(excluded.occurred_at, skill_evidence.occurred_at)
    `;
    written += 1;
  }

  return written;
}
