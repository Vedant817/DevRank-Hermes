import type { DailyPlan, DailyPlanTask, ScoreSnapshot } from "@repo/shared";
import { explainWeakestLanes } from "@repo/scoring";

function taskForLane(lane: string): DailyPlanTask {
  if (lane.includes("DSA")) {
    return {
      title: "Solve two medium DSA questions and record patterns learned.",
      category: "dsa",
      minutes: 45,
      evidence: lane,
    };
  }

  if (lane.includes("Backend")) {
    return {
      title: "Build or improve one API endpoint with validation and pagination.",
      category: "backend",
      minutes: 60,
      evidence: lane,
    };
  }

  if (lane.includes("GitHub")) {
    return {
      title: "Improve one repository with README, tests, or architecture proof.",
      category: "github",
      minutes: 45,
      evidence: lane,
    };
  }

  if (lane.includes("AI Agent")) {
    return {
      title: "Turn one repeated AI-agent workflow into a reusable documented skill.",
      category: "ai_agent",
      minutes: 30,
      evidence: lane,
    };
  }

  return {
    title: `Create evidence for ${lane}.`,
    category: "public_proof",
    minutes: 30,
    evidence: lane,
  };
}

export function generateDailyPlan(
  snapshot: ScoreSnapshot,
  date = new Date().toISOString().slice(0, 10),
  urgentLinearTask?: string,
): DailyPlan {
  const weakLanes = explainWeakestLanes(snapshot, 3);
  const tasks = weakLanes.map(taskForLane);

  if (urgentLinearTask) {
    tasks.unshift({
      title: urgentLinearTask,
      category: "linear",
      minutes: 30,
      evidence: "Linear priority",
    });
  }

  return {
    date,
    tasks,
    targetMinutes: tasks.reduce((total, task) => total + task.minutes, 0),
  };
}

export function formatDailyPlanForSlack(plan: DailyPlan): string {
  const tasks = plan.tasks
    .map((task, index) => `${index + 1}. ${task.title} (${task.minutes} min)`)
    .join("\n");

  return `DevRank OS plan for ${plan.date}\nTarget: ${plan.targetMinutes} min\n${tasks}`;
}
