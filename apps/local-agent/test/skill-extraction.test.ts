import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readLocalAgentState,
  runWeeklySkillExtractionIfDue,
  shouldRunWeeklySkillExtraction,
  writeLocalAgentState,
} from "../src/skill-extraction.js";
import type { LocalAgentWeeklySkillExtractionConfig } from "../src/config.js";

const baseConfig: LocalAgentWeeklySkillExtractionConfig = {
  enabled: true,
  evidenceLimit: 100,
  intervalDays: 7,
  statePath: "/tmp/devrank-state.json",
};

test("weekly skill extraction is due when no prior run exists", () => {
  assert.equal(
    shouldRunWeeklySkillExtraction({}, baseConfig, new Date("2026-01-08T00:00:00.000Z")),
    true,
  );
});

test("weekly skill extraction waits for configured interval", () => {
  const state = {
    weeklySkillExtraction: {
      lastRunAt: "2026-01-01T00:00:00.000Z",
    },
  };

  assert.equal(
    shouldRunWeeklySkillExtraction(state, baseConfig, new Date("2026-01-07T23:59:59.000Z")),
    false,
  );
  assert.equal(
    shouldRunWeeklySkillExtraction(state, baseConfig, new Date("2026-01-08T00:00:00.000Z")),
    true,
  );
});

test("weekly skill extraction skips when persistence is disabled", async () => {
  const result = await runWeeklySkillExtractionIfDue({
    config: baseConfig,
    persist: false,
  });

  assert.equal(result.ran, false);
  assert.equal(result.reason, "persistence_disabled");
});

test("local agent state round trips through disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrank-local-agent-state-"));
  const statePath = join(root, "state.json");
  await writeLocalAgentState(statePath, {
    weeklySkillExtraction: {
      lastEvidenceCount: 10,
      lastRunAt: "2026-01-08T00:00:00.000Z",
      lastSkillCount: 3,
    },
  });

  const raw = await readFile(statePath, "utf8");
  const state = await readLocalAgentState(statePath);

  assert.match(raw, /lastEvidenceCount/);
  assert.equal(state.weeklySkillExtraction?.lastRunAt, "2026-01-08T00:00:00.000Z");
  assert.equal(state.weeklySkillExtraction?.lastSkillCount, 3);
});
