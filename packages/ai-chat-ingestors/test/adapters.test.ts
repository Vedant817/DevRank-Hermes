import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestAntigravitySessions, parseAntigravityArtifact } from "../src/antigravity.js";
import { parseClaudeSessionFile } from "../src/claude.js";
import { parseCodexSessionFile } from "../src/codex.js";
import { ingestLocalAiChats } from "../src/index.js";
import { parseOpenCodeSessionDir } from "../src/opencode.js";

test("parses Codex jsonl sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-codex-"));
  const file = join(root, "session.jsonl");
  await writeFile(file, [
    JSON.stringify({
      role: "user",
      message: "Build an endpoint token=secret-value",
      timestamp: "2026-01-01T00:00:00.000Z",
      cmd: "pnpm test",
      path: "apps/web/app/api/route.ts",
      cwd: "/repo",
    }),
  ].join("\n"));

  const session = await parseCodexSessionFile(file);

  assert.equal(session.agentName, "Codex");
  assert.equal(session.messages[0]?.role, "user");
  assert.match(session.messages[0]?.content ?? "", /\[REDACTED_SECRET\]/);
  assert.deepEqual(session.commandsRun, ["pnpm test"]);
  assert.deepEqual(session.filesTouched, ["apps/web/app/api/route.ts"]);
});

test("parses Claude Code project jsonl sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-claude-"));
  const file = join(root, "session.jsonl");
  await writeFile(file, [
    JSON.stringify({
      type: "user",
      timestamp: "2026-01-01T00:00:00.000Z",
      cwd: "/repo",
      gitBranch: "feature/adapter",
      message: {
        role: "user",
        content: [{ type: "text", text: "Please fix the parser" }],
      },
    }),
  ].join("\n"));

  const session = await parseClaudeSessionFile(file);

  assert.equal(session.agentName, "Claude Code");
  assert.equal(session.messages[0]?.content, "Please fix the parser");
  assert.match(session.projectContext ?? "", /\/repo/);
  assert.match(session.projectContext ?? "", /feature\/adapter/);
});

test("parses OpenCode storage message and part files", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-opencode-"));
  const sessionDir = join(root, "storage", "message", "ses_1");
  const partDir = join(root, "storage", "part", "msg_1");
  await mkdir(sessionDir, { recursive: true });
  await mkdir(partDir, { recursive: true });
  await writeFile(join(sessionDir, "msg_1.json"), JSON.stringify({
    id: "msg_1",
    sessionID: "ses_1",
    role: "assistant",
    time: { created: "2026-01-01T00:00:00.000Z" },
    summary: { title: "Parser work" },
    tools: { task: {} },
  }));
  await writeFile(join(partDir, "part_1.json"), JSON.stringify({
    id: "part_1",
    messageID: "msg_1",
    type: "text",
    text: "Implemented adapter parsing with api_key=opencode-secret.",
  }));
  await writeFile(join(sessionDir, "bad.json"), "{not-json");

  const session = await parseOpenCodeSessionDir(sessionDir);

  assert.equal(session.agentName, "OpenCode");
  assert.equal(session.messages[0]?.role, "assistant");
  assert.match(session.messages[0]?.content ?? "", /Implemented adapter parsing/);
  assert.match(session.messages[0]?.content ?? "", /\[REDACTED_SECRET\]/);
  assert.deepEqual(session.redactions, ["[REDACTED_SECRET]"]);
  assert.deepEqual(session.toolCalls, ["task"]);
});

test("parses Antigravity artifact metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-antigravity-"));
  const file = join(root, "task.md.metadata.json");
  await writeFile(file, JSON.stringify({
    artifactType: "task",
    summary: "Completed adapter discovery.",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

  const session = await parseAntigravityArtifact(file);

  assert.equal(session.agentName, "Antigravity");
  assert.equal(session.messages[0]?.content, "Completed adapter discovery.");
  assert.deepEqual(session.filesTouched, [join(root, "task.md")]);
});

test("skips malformed Antigravity metadata and keeps valid artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-antigravity-"));
  await writeFile(join(root, "broken.metadata.json"), "{not-json");
  await writeFile(join(root, "valid.metadata.json"), JSON.stringify({
    artifactType: "task",
    summary: "Kept valid artifact.",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

  const sessions = await ingestAntigravitySessions(root);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.messages[0]?.content, "Kept valid artifact.");
});

test("ingests through the adapter registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-registry-"));
  const file = join(root, "session.jsonl");
  await writeFile(file, JSON.stringify({
    role: "user",
    message: "Use adapter registry",
  }));

  const result = await ingestLocalAiChats({
    enabledAdapters: ["codex"],
    sourceRoots: [root],
  });

  assert.equal(result.sessions.length, 1);
  assert.equal(result.adapterCounts.codex, 1);
  assert.equal(result.evidence.length, 1);
  assert.deepEqual(result.embeddings, []);
  assert.deepEqual(result.transcripts, []);
  assert.deepEqual(result.privacy, {
    embeddingStatus: "disabled",
    rawStorageStatus: "local_only",
    redactionStatus: "passed",
    uploadRawChats: false,
    storeEmbeddings: false,
  });
});

test("rejects unsafe privacy modes instead of ignoring flags", async () => {
  await assert.rejects(
    ingestLocalAiChats({ enabledAdapters: [], redactSecrets: false }),
    /requires secret redaction/,
  );
});

test("routes known source roots to matching adapters", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-routed-sources-"));
  const codexRoot = join(root, ".codex", "sessions");
  const claudeRoot = join(root, ".claude", "projects", "repo");
  await mkdir(codexRoot, { recursive: true });
  await mkdir(claudeRoot, { recursive: true });
  await writeFile(join(codexRoot, "codex.jsonl"), JSON.stringify({
    role: "user",
    message: "Use Codex adapter",
  }));
  await writeFile(join(claudeRoot, "claude.jsonl"), JSON.stringify({
    message: {
      role: "user",
      content: "Use Claude adapter",
    },
  }));

  const result = await ingestLocalAiChats({
    sourceRoots: [codexRoot, claudeRoot],
  });

  assert.equal(result.adapterCounts.codex, 1);
  assert.equal(result.adapterCounts.claude, 1);
  assert.equal(result.adapterCounts.opencode, 0);
  assert.equal(result.adapterCounts.antigravity, 0);
  assert.equal(result.sessions.length, 2);
});

test("generates embeddings from redacted evidence summaries when enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-embedding-ingest-"));
  const file = join(root, "session.jsonl");
  const generatedInputs: string[][] = [];

  await writeFile(file, JSON.stringify({
    role: "user",
    message: "Build tests with token=secret-value",
  }));

  const result = await ingestLocalAiChats({
    embeddingGenerator: async (texts) => {
      generatedInputs.push(texts);

      return {
        embeddings: texts.map(() => [0.1, 0.2, 0.3]),
        model: "test-embedding-model",
      };
    },
    enabledAdapters: ["codex"],
    sourceRoots: [root],
    storeEmbeddings: true,
  });

  assert.equal(result.privacy.embeddingStatus, "generated");
  assert.equal(result.privacy.storeEmbeddings, true);
  assert.equal(result.embeddings.length, 1);
  assert.equal(result.embeddings[0]?.model, "test-embedding-model");
  assert.deepEqual(result.embeddings[0]?.embedding, [0.1, 0.2, 0.3]);
  assert.equal(result.embeddings[0]?.source, "local_session");
  assert.equal(result.embeddings[0]?.sourceId, result.evidence[0]?.id);
  assert.match(generatedInputs[0]?.[0] ?? "", /\[REDACTED_SECRET\]/);
  assert.doesNotMatch(generatedInputs[0]?.[0] ?? "", /secret-value/);
});

test("prepares redacted transcript records only when raw cloud storage is explicitly enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-transcript-storage-"));
  const file = join(root, "session.jsonl");

  await writeFile(file, JSON.stringify({
    role: "user",
    message: "Review this with api_key=secret-value",
  }));

  const result = await ingestLocalAiChats({
    enabledAdapters: ["codex"],
    rawStorageEnabled: true,
    sourceRoots: [root],
  });

  assert.equal(result.privacy.rawStorageStatus, "redacted_cloud");
  assert.equal(result.privacy.uploadRawChats, true);
  assert.equal(result.transcripts.length, 1);
  assert.equal(result.transcripts[0]?.rawStored, true);
  assert.match(result.transcripts[0]?.messages[0]?.content ?? "", /\[REDACTED_SECRET\]/);
  assert.doesNotMatch(result.transcripts[0]?.messages[0]?.content ?? "", /secret-value/);
});
