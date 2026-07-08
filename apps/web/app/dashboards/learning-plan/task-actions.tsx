"use client";

import { useTransition } from "react";
import { markTaskStatus } from "./actions";

type TaskActionButtonsProps = {
  planDate: string;
  taskKey: string;
  status: string;
};

export function TaskActionButtons({
  planDate,
  taskKey,
  status,
}: TaskActionButtonsProps) {
  const [isPending, startTransition] = useTransition();

  function run(nextStatus: "completed" | "skipped" | "pending") {
    startTransition(async () => {
      await markTaskStatus(planDate, taskKey, nextStatus);
    });
  }

  const isCompleted = status === "completed";
  const isSkipped = status === "skipped";

  return (
    <span role="group" aria-label="Task status actions">
      <button
        type="button"
        aria-label="Mark task done"
        disabled={isPending || isCompleted}
        onClick={() => run("completed")}
      >
        Mark done
      </button>
      <button
        type="button"
        aria-label="Skip task"
        disabled={isPending || isSkipped}
        onClick={() => run("skipped")}
      >
        Skip
      </button>
    </span>
  );
}
