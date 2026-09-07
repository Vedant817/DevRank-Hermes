import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_LOCAL_AGENT_LOG_BYTES,
  summarizeLocalAgentResult,
  writeLocalAgentLog,
} from "../src/logging.js";

test("summarizes ingestion without transcript, evidence, or embedding bodies", () => {
  const summary = summarizeLocalAgentResult({
    adapterCounts: { codex: 1 },
    embeddings: [[0.1, 0.2]],
    evidence: [{ summary: "private evidence" }],
    redactionCount: 2,
    sessions: [{ messages: [{ content: "private transcript" }] }],
    transcripts: [{ messages: [{ content: "private transcript" }] }],
    watching: ["/private/path"],
  });
  const serialized = JSON.stringify(summary);

  assert.equal(summary.sessions, 1);
  assert.equal(summary.evidence, 1);
  assert.equal(summary.embeddings, 1);
  assert.equal(summary.transcripts, 1);
  assert.doesNotMatch(serialized, /private transcript|private evidence|0\.1/);
});

test("writes private rotating local-agent logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-agent-log-"));
  const logPath = join(root, "local-agent.log");
  await writeFile(logPath, "x".repeat(MAX_LOCAL_AGENT_LOG_BYTES), "utf8");
  await chmod(logPath, 0o644);

  await writeLocalAgentLog({
    event: "ingestion_complete",
    sessions: 3,
  }, logPath);

  const current = await readFile(logPath, "utf8");
  const rotated = await stat(`${logPath}.1`);

  assert.match(current, /"event":"ingestion_complete"/);
  assert.equal(rotated.size, MAX_LOCAL_AGENT_LOG_BYTES);

  if (process.platform !== "win32") {
    const mode = (await stat(logPath)).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});
