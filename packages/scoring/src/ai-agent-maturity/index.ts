import type { ScoreBreakdown, ScoreSnapshot } from "@repo/shared";
import {
  countActuallyReusedSkills,
  crossReferenceValidation,
  type PrValidationCheck,
} from "./validation.js";

export { countActuallyReusedSkills, crossReferenceValidation };
export type { PrValidationCheck };

export interface AiAgentMaturitySessionSignal {
  commandsRun: string[];
  errorsFaced: string[];
  filesTouched: string[];
  prompts: string[];
  repeatedMistakes: string[];
  toolCalls: string[];
  linkedPullRequestNumber?: number;
  linkedRepoFullName?: string;
}

export interface AiAgentMaturityInput {
  reusableSkillCount: number;
  sessions: AiAgentMaturitySessionSignal[];
}

export const aiAgentMaturityRubricVersion = "ai-agent-maturity-v2";

export const aiAgentMaturityRubric = [
  { label: "Task Planning", weight: 0.25 },
  { label: "Prompt Quality", weight: 0.2 },
  { label: "Validation After AI Output", weight: 0.2 },
  { label: "Tool/Orchestrator Setup", weight: 0.15 },
  { label: "Reusable Skills Created", weight: 0.1 },
  { label: "Reduced Repeated Mistakes", weight: 0.1 },
] as const;

const planningPattern = /\b(plan|steps?|first|then|checklist|break(ing)? down|phases?|milestones?)\b/i;
const structuredListPattern = /(^|\n)\s*([0-9]+[.)]|[-*]\s)/;
const contextPattern = /\b(file|path|test|error|api|function|endpoint|schema|command|migration|route)\b|\//i;
const validationCommandPattern = /\b(test|lint|build|typecheck|tsc|vitest|pytest)\b/i;

export function computeAiAgentMaturitySnapshot(
  input: AiAgentMaturityInput,
  generatedAt = new Date().toISOString(),
  prChecks?: PrValidationCheck[],
): ScoreSnapshot {
  const sessionCount = input.sessions.length;
  const planningSessions = input.sessions.filter((session) =>
    session.prompts.some((prompt) =>
      planningPattern.test(prompt) || structuredListPattern.test(prompt) || prompt.length >= 200,
    ),
  ).length;
  const qualityPromptSessions = input.sessions.filter((session) =>
    session.prompts.some((prompt) => prompt.trim().length >= 80 && contextPattern.test(prompt)),
  ).length;

  const validationMap = prChecks ? crossReferenceValidation(input.sessions, prChecks) : null;
  const validatedSessions = input.sessions.filter((session, index) =>
    validationMap
      ? validationMap.get(index) === true
      : session.commandsRun.some((command) => validationCommandPattern.test(command)),
  ).length;
  const toolSessions = input.sessions.filter((session) => session.toolCalls.length > 0).length;
  const distinctTools = new Set(
    input.sessions.flatMap((session) => session.toolCalls.map((tool) => tool.toLowerCase())),
  ).size;
  const repeatedMistakeSessions = input.sessions.filter(
    (session) => session.repeatedMistakes.length > 0,
  ).length;
  const actuallyReusedSkills = countActuallyReusedSkills(input.sessions);

  const breakdown: ScoreBreakdown[] = [
    lane("Task Planning", 0.25, ratioScore(planningSessions, sessionCount), planningSessions,
      `${planningSessions} of ${sessionCount} session(s) show task breakdown in prompts.`),
    lane("Prompt Quality", 0.2, ratioScore(qualityPromptSessions, sessionCount), qualityPromptSessions,
      `${qualityPromptSessions} of ${sessionCount} session(s) include specific, context-rich prompts.`),
    lane("Validation After AI Output", 0.2, ratioScore(validatedSessions, sessionCount), validatedSessions,
      `${validatedSessions} of ${sessionCount} session(s) ran test/lint/build validation commands.`),
    lane("Tool/Orchestrator Setup", 0.15,
      sessionCount === 0 ? 0 : clampScore((toolSessions / sessionCount) * 70 + Math.min(30, distinctTools * 6)),
      toolSessions,
      `${toolSessions} of ${sessionCount} session(s) used tools across ${distinctTools} distinct tool(s).`),
    lane("Reusable Skills Created", 0.1,
      input.reusableSkillCount === 0 ? 0 : clampScore(60 + Math.min(input.reusableSkillCount * 8, 40)),
      input.reusableSkillCount,
      input.reusableSkillCount > 0
        ? `${input.reusableSkillCount} reusable skill(s) captured.`
        : "No reusable skills captured yet."),
    lane("Reduced Repeated Mistakes", 0.1,
      sessionCount === 0 ? 0 : clampScore((1 - (repeatedMistakeSessions - actuallyReusedSkills) / sessionCount) * 100),
      sessionCount - repeatedMistakeSessions + actuallyReusedSkills,
      `${repeatedMistakeSessions} of ${sessionCount} session(s) show repeated mistake signals; ${actuallyReusedSkills} mistake(s) captured as reused skill(s).`),
  ];

  return {
    overall: clampScore(breakdown.reduce((total, item) => total + item.score * item.weight, 0)),
    generatedAt,
    breakdown,
    rubricVersion: aiAgentMaturityRubricVersion,
  };
}

function lane(
  label: string,
  weight: number,
  score: number,
  evidenceCount: number,
  explanation: string,
): ScoreBreakdown {
  return { label, score, weight, evidenceCount, explanation };
}

function ratioScore(matching: number, total: number): number {
  return total === 0 ? 0 : clampScore((matching / total) * 100);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
