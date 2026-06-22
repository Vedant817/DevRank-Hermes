import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  codexDefaultRoot,
  defaultLocalSourceRoots,
} from "@repo/ai-chat-ingestors";

export interface LocalAgentPrivacyConfig {
  uploadRawChats: boolean;
  redactSecrets: boolean;
  storeEmbeddings: boolean;
}

export interface LocalAgentWeeklySkillExtractionConfig {
  enabled: boolean;
  evidenceLimit: number;
  intervalDays: number;
  statePath: string;
}

export interface LocalAgentAutomationConfig {
  weeklySkillExtraction: LocalAgentWeeklySkillExtractionConfig;
}

export interface LocalAgentConfig {
  automation: LocalAgentAutomationConfig;
  sources: string[];
  privacy: LocalAgentPrivacyConfig;
}

export interface LocalAgentConfigInput {
  automation?: {
    weeklySkillExtraction?: Partial<LocalAgentWeeklySkillExtractionConfig>;
  };
  codexSessionsDir?: string;
  configPath?: string;
  privacy?: Partial<LocalAgentPrivacyConfig>;
  sources?: string[];
}

export const defaultLocalAgentConfigPath = join(homedir(), ".devrank", "local-agent.json");
export const defaultLocalAgentStatePath = join(homedir(), ".devrank", "local-agent-state.json");

export function createDefaultLocalAgentConfig(input: LocalAgentConfigInput = {}): LocalAgentConfig {
  const codexSessionsDir = input.codexSessionsDir ?? codexDefaultRoot;
  const inputSources = input.sources && input.sources.length > 0 ? input.sources : undefined;
  const sources = inputSources ?? [
    codexSessionsDir,
    ...defaultLocalSourceRoots.filter((root) => root !== codexDefaultRoot && root !== codexSessionsDir),
  ];

  return {
    automation: {
      weeklySkillExtraction: {
        enabled: true,
        evidenceLimit: 250,
        intervalDays: 7,
        statePath: defaultLocalAgentStatePath,
        ...input.automation?.weeklySkillExtraction,
      },
    },
    sources: uniqueNonEmptyStrings(sources),
    privacy: {
      uploadRawChats: false,
      redactSecrets: true,
      storeEmbeddings: true,
      ...input.privacy,
    },
  };
}

export async function loadLocalAgentConfig(input: LocalAgentConfigInput = {}): Promise<LocalAgentConfig> {
  const configPath = input.configPath ?? envConfigPath();
  const fileConfig = configPath ? await readLocalAgentConfig(configPath, input) : undefined;
  const defaultConfig = createDefaultLocalAgentConfig(input);

  return normalizeLocalAgentConfig({
    sources: input.sources ?? fileConfig?.sources ?? defaultConfig.sources,
    automation: {
      weeklySkillExtraction: {
        ...defaultConfig.automation.weeklySkillExtraction,
        ...fileConfig?.automation.weeklySkillExtraction,
        ...input.automation?.weeklySkillExtraction,
      },
    },
    privacy: {
      ...defaultConfig.privacy,
      ...fileConfig?.privacy,
      ...input.privacy,
    },
  });
}

export async function readLocalAgentConfig(
  configPath = defaultLocalAgentConfigPath,
  input: LocalAgentConfigInput = {},
): Promise<LocalAgentConfig | undefined> {
  try {
    return normalizeLocalAgentConfig(JSON.parse(await readFile(configPath, "utf8")), input);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function writeDefaultLocalAgentConfig(input: LocalAgentConfigInput = {}) {
  const configPath = input.configPath ?? defaultLocalAgentConfigPath;
  const config = createDefaultLocalAgentConfig(input);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  return {
    configPath,
    config,
  };
}

function normalizeLocalAgentConfig(value: unknown, input: LocalAgentConfigInput = {}): LocalAgentConfig {
  const record = asRecord(value);
  const automation = asRecord(record.automation);
  const weeklySkillExtraction = asRecord(automation.weeklySkillExtraction);
  const privacy = asRecord(record.privacy);

  const sources = Array.isArray(record.sources)
    ? record.sources.filter((source): source is string => typeof source === "string" && source.trim().length > 0)
    : undefined;

  return createDefaultLocalAgentConfig({
    automation: {
      weeklySkillExtraction: {
        enabled: booleanValue(weeklySkillExtraction.enabled, true),
        evidenceLimit: positiveNumberValue(weeklySkillExtraction.evidenceLimit, 250),
        intervalDays: positiveNumberValue(weeklySkillExtraction.intervalDays, 7),
        statePath: stringValue(weeklySkillExtraction.statePath, defaultLocalAgentStatePath),
      },
    },
    codexSessionsDir: input.codexSessionsDir,
    privacy: {
      uploadRawChats: booleanValue(privacy.uploadRawChats, false),
      redactSecrets: booleanValue(privacy.redactSecrets, true),
      storeEmbeddings: booleanValue(privacy.storeEmbeddings, true),
    },
    sources: sources && sources.length > 0 ? sources : undefined,
  });
}

function envConfigPath() {
  const value = process.env.DEVRANK_LOCAL_AGENT_CONFIG;

  return value && value.trim().length > 0 ? value : defaultLocalAgentConfigPath;
}

function uniqueNonEmptyStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function positiveNumberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
