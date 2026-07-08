export interface TaskActionItem {
  taskKey: string;
  date: string;
  title: string;
  minutes: number;
  evidence?: string;
}

export function buildDailyPlanBlocks(
  tasks: TaskActionItem[],
): Record<string, unknown>[] {
  const header: Record<string, unknown> = {
    type: "header",
    text: {
      type: "plain_text",
      text: `:clipboard: DevRank OS — ${tasks.length > 0 ? tasks[0]!.date : "Today"}`,
      emoji: true,
    },
  };

  const divider: Record<string, unknown> = { type: "divider" };

  const taskBlocks: Record<string, unknown>[] = [];

  for (const task of tasks) {
    const value = JSON.stringify({ date: task.date, taskKey: task.taskKey });

    taskBlocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${task.title}* (${task.minutes} min)${task.evidence ? `\n_${task.evidence}_` : ""}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Done", emoji: true },
            style: "primary",
            value,
            action_id: "task_complete",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Skip", emoji: true },
            style: "danger",
            value,
            action_id: "task_skip",
          },
        ],
        block_id: `task_${task.date}_${task.taskKey}`,
      },
    );
  }

  return [header, divider, ...taskBlocks];
}
