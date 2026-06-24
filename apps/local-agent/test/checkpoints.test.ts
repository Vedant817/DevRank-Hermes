import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_LOCAL_AI_FILE_BYTES } from "@repo/ai-chat-ingestors";
import {
  drainPendingSourceFiles,
  inspectChangedSourceFiles,
  MAX_LOCAL_AGENT_CHECKPOINTS,
  persistSourceFileCheckpoints,
} from "../src/checkpoints.js";
import { readLocalAgentState } from "../src/skill-extraction.js";

test("changed-file checkpoints prevent unchanged files from being ingested twice", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-checkpoints-"));
  const statePath = join(root, "state.json");
  const sourcePath = join(root, "session.jsonl");
  await writeFile(sourcePath, "{}");

  const first = await inspectChangedSourceFiles([sourcePath], {});
  assert.deepEqual(first.sourceFiles, [sourcePath]);
  await persistSourceFileCheckpoints(statePath, first.checkpoints);

  const state = await readLocalAgentState(statePath);
  const second = await inspectChangedSourceFiles([sourcePath], state);

  assert.deepEqual(second.sourceFiles, []);
  assert.deepEqual(second.checkpoints, {});
  assert.equal((await readFile(statePath)).length > 0, true);
});

test("oversized changed files are checkpointed but excluded from ingestion", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-checkpoint-size-"));
  const sourcePath = join(root, "session.jsonl");
  await writeFile(sourcePath, "");
  await truncate(sourcePath, MAX_LOCAL_AI_FILE_BYTES + 1);

  const result = await inspectChangedSourceFiles([sourcePath], {});

  assert.deepEqual(result.sourceFiles, []);
  assert.equal(result.checkpoints[sourcePath]?.size, MAX_LOCAL_AI_FILE_BYTES + 1);
});

test("pending source batches retain events beyond the configured batch", () => {
  const pending = new Set(
    Array.from({ length: 105 }, (_, index) => `/tmp/session-${index}.jsonl`),
  );

  const first = drainPendingSourceFiles(pending);
  const second = drainPendingSourceFiles(pending);

  assert.equal(first.length, 100);
  assert.equal(second.length, 5);
  assert.equal(pending.size, 0);
});

test("checkpoint persistence retains only the newest bounded entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-checkpoint-retention-"));
  const statePath = join(root, "state.json");
  const checkpoints = Object.fromEntries(
    Array.from({ length: MAX_LOCAL_AGENT_CHECKPOINTS + 1 }, (_, index) => [
      `/tmp/session-${index}.jsonl`,
      { mtimeMs: index, size: index },
    ]),
  );

  await persistSourceFileCheckpoints(statePath, checkpoints);

  const files = (await readLocalAgentState(statePath)).ingestion?.files ?? {};
  assert.equal(Object.keys(files).length, MAX_LOCAL_AGENT_CHECKPOINTS);
  assert.equal(files["/tmp/session-0.jsonl"], undefined);
  assert.equal(files[`/tmp/session-${MAX_LOCAL_AGENT_CHECKPOINTS}.jsonl`]?.mtimeMs, MAX_LOCAL_AGENT_CHECKPOINTS);
});
