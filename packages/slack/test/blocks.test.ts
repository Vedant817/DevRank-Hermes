import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyPlanBlocks, type TaskActionItem } from "../src/blocks.js";

function makeTask(overrides?: Partial<TaskActionItem>): TaskActionItem {
  return {
    taskKey: "REPO-123",
    date: "2025-01-15",
    title: "Implement feature",
    minutes: 60,
    ...overrides,
  };
}

test("returns header + divider when tasks array is empty", () => {
  const blocks = buildDailyPlanBlocks([]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]!.type, "header");
  assert.equal(blocks[1]!.type, "divider");
});

test("returns correct number of blocks: header + divider + 2 per task", () => {
  const blocks = buildDailyPlanBlocks([makeTask(), makeTask({ taskKey: "REPO-456", title: "Fix bug" })]);
  assert.equal(blocks.length, 6);
});

test("each task gets a section block and an actions block", () => {
  const blocks = buildDailyPlanBlocks([makeTask()]);
  assert.equal(blocks[2]!.type, "section");
  assert.equal(blocks[3]!.type, "actions");
});

test("Done button has style primary and action_id task_complete", () => {
  const blocks = buildDailyPlanBlocks([makeTask()]);
  const actionsBlock = blocks[3]! as { elements: Record<string, unknown>[] };
  const doneButton = actionsBlock.elements[0]! as Record<string, unknown>;
  assert.equal(doneButton.type, "button");
  assert.equal((doneButton.text as Record<string, string>).text, "Done");
  assert.equal(doneButton.style, "primary");
  assert.equal(doneButton.action_id, "task_complete");
});

test("Skip button has style danger and action_id task_skip", () => {
  const blocks = buildDailyPlanBlocks([makeTask()]);
  const actionsBlock = blocks[3]! as { elements: Record<string, unknown>[] };
  const skipButton = actionsBlock.elements[1]! as Record<string, unknown>;
  assert.equal(skipButton.type, "button");
  assert.equal((skipButton.text as Record<string, string>).text, "Skip");
  assert.equal(skipButton.style, "danger");
  assert.equal(skipButton.action_id, "task_skip");
});

test("button value contains JSON with date and taskKey", () => {
  const blocks = buildDailyPlanBlocks([makeTask()]);
  const actionsBlock = blocks[3]! as { elements: Record<string, unknown>[] };
  const value = actionsBlock.elements[0]!.value as string;
  const parsed = JSON.parse(value);
  assert.equal(parsed.date, "2025-01-15");
  assert.equal(parsed.taskKey, "REPO-123");
});
