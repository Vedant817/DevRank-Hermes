import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexDefaultRoot } from "@repo/ai-chat-ingestors";
import {
  createDefaultLocalAgentConfig,
  loadLocalAgentConfig,
  writeDefaultLocalAgentConfig,
} from "../src/config.js";

test("creates default watcher paths with privacy-safe settings", () => {
  const config = createDefaultLocalAgentConfig({
    codexSessionsDir: "/tmp/devrank/codex",
  });

  assert.equal(config.sources[0], "/tmp/devrank/codex");
  assert.equal(config.sources.includes(codexDefaultRoot), false);
  assert.equal(config.automation.weeklySkillExtraction.enabled, true);
  assert.equal(config.automation.weeklySkillExtraction.intervalDays, 7);
  assert.equal(config.privacy.uploadRawChats, false);
  assert.equal(config.privacy.redactSecrets, true);
  assert.equal(config.privacy.storeEmbeddings, false);
});

test("writes and loads local agent config", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-local-agent-config-"));
  const configPath = join(root, "local-agent.json");
  const written = await writeDefaultLocalAgentConfig({
    configPath,
    sources: ["/tmp/source-a", "/tmp/source-a", "/tmp/source-b"],
  });
  const loaded = await loadLocalAgentConfig({ configPath });

  assert.equal(written.configPath, configPath);
  assert.deepEqual(loaded.sources, ["/tmp/source-a", "/tmp/source-b"]);
  assert.equal(loaded.privacy.uploadRawChats, false);
});

test("merges file config with explicit runtime overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-local-agent-config-"));
  const configPath = join(root, "local-agent.json");
  await writeFile(configPath, JSON.stringify({
    privacy: {
      redactSecrets: false,
      storeEmbeddings: false,
      uploadRawChats: true,
    },
    sources: ["/tmp/file-source"],
  }));

  const loaded = await loadLocalAgentConfig({
    configPath,
    privacy: { redactSecrets: true },
    sources: ["/tmp/runtime-source"],
  });

  assert.deepEqual(loaded.sources, ["/tmp/runtime-source"]);
  assert.equal(loaded.privacy.uploadRawChats, true);
  assert.equal(loaded.privacy.redactSecrets, true);
  assert.equal(loaded.privacy.storeEmbeddings, false);
});

test("falls back to default sources when config sources are empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-local-agent-config-"));
  const configPath = join(root, "local-agent.json");
  await writeFile(configPath, JSON.stringify({
    sources: [],
  }));

  const loaded = await loadLocalAgentConfig({
    codexSessionsDir: "/tmp/default-codex",
    configPath,
  });

  assert.equal(loaded.sources[0], "/tmp/default-codex");
  assert.equal(loaded.sources.length > 1, true);
});
