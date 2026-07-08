import type { AiAgentMaturitySessionSignal } from "./index.js";

export interface PrValidationCheck {
  pullRequestNumber: number;
  repoFullName: string;
  conclusion: string | null;
}

const validationCommandPattern = /\b(test|lint|build|typecheck|tsc|vitest|pytest)\b/i;

export function crossReferenceValidation(
  sessions: AiAgentMaturitySessionSignal[],
  prChecks: PrValidationCheck[],
): Map<number, boolean> {
  const result = new Map<number, boolean>();

  for (let index = 0; index < sessions.length; index++) {
    const session = sessions[index];
    if (!session) {
      result.set(index, false);
      continue;
    }
    const hasLinkedPr =
      session.linkedPullRequestNumber !== undefined &&
      session.linkedPullRequestNumber !== null &&
      typeof session.linkedRepoFullName === "string" &&
      session.linkedRepoFullName.length > 0;

    if (hasLinkedPr) {
      const matching = prChecks.find(
        (check) =>
          check.pullRequestNumber === session.linkedPullRequestNumber &&
          check.repoFullName === session.linkedRepoFullName,
      );
      const satisfied = matching !== undefined && matching.conclusion === "success";
      result.set(index, satisfied);
      continue;
    }

    result.set(
      index,
      session.commandsRun.some((command) => validationCommandPattern.test(command)),
    );
  }

  return result;
}

function normalizeSkill(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\brepeated\s+\d+\s+times?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function referencesSkill(text: string, skill: string): boolean {
  return text.toLowerCase().includes(skill) && skill.length > 0;
}

export function countActuallyReusedSkills(sessions: AiAgentMaturitySessionSignal[]): number {
  const reused = new Set<string>();

  for (let index = 0; index < sessions.length; index++) {
    const session = sessions[index];
    if (!session) {
      continue;
    }
    for (const mistake of session.repeatedMistakes) {
      const skill = normalizeSkill(mistake);
      if (skill.length === 0) {
        continue;
      }
      if (reused.has(skill)) {
        continue;
      }
      for (let later = index + 1; later < sessions.length; later++) {
        const laterSession = sessions[later];
        if (!laterSession) {
          continue;
        }
        const haystack = [
          ...laterSession.prompts,
          ...laterSession.commandsRun,
          ...laterSession.repeatedMistakes,
        ].join("\n");
        if (referencesSkill(haystack, skill)) {
          reused.add(skill);
          break;
        }
      }
    }
  }

  return reused.size;
}
