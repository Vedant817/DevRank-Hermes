#!/usr/bin/env node
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  checkVectorSupport,
  closeSqlClient,
  createSlackNotificationAttempt,
  createSqlClient,
  getLatestScoreSnapshot,
  insertDailyPlan,
  insertIngestionRun,
  insertScoreSnapshot,
  listEvidenceItems,
  listScoringEvidence,
  runDbMigrations,
  upsertAiChatSessions,
  upsertGithubBackfill,
  upsertEvidenceEmbeddings,
  upsertEvidenceItems,
  upsertLinearBackfill,
  markSlackNotificationDelivered,
  markSlackNotificationFailed,
  type SqlClient,
} from "@repo/db";
import { buildReusableSkillArtifacts, writeReusableSkillArtifacts } from "@repo/hermes";
import { formatDailyPlanForSlack, generateDailyPlan } from "@repo/planner";
import {
  computeSdeReadinessSnapshot,
  isCurrentSdeReadinessSnapshot,
} from "@repo/scoring";
import { runMarketBenchmark } from "@repo/search";
import { evidenceSources } from "@repo/shared";
import { sendSlackMessage } from "@repo/slack";
import { CliError } from "./errors.js";
import {
  booleanOption,
  numberOption,
  parseArgs,
  stringListOption,
  stringOption,
  type OptionValue,
  type ParsedArgs,
} from "./options.js";
type EvidenceItemForCli = Awaited<ReturnType<typeof listEvidenceItems>>[number];

type EnvRequirement = {
  label: string;
  oneOf: string[][];
};

type OptionRequirement = {
  name: string;
  label: string;
};

type CommandContext = {
  command: string;
  options: Record<string, OptionValue>;
  positionals: string[];
  env: NodeJS.ProcessEnv;
  config: Record<string, unknown>;
};

type CommandHandler = (context: CommandContext) => Promise<unknown> | unknown;
type UnknownFunction = (...args: unknown[]) => unknown;
type ModuleExports = Record<string, unknown>;
type CommandInvoker = (
  moduleExports: ModuleExports,
  context: CommandContext,
  moduleName: string,
) => Promise<unknown> | unknown;

type CommandSpec = {
  name: string;
  description: string;
  usage: string;
  moduleCandidates: string[];
  exportCandidates: string[];
  envRequirements: EnvRequirement[];
  optionRequirements?: OptionRequirement[];
  buildConfig: (parsed: ParsedArgs, env: NodeJS.ProcessEnv) => Record<string, unknown>;
  localHandler?: CommandHandler;
  invoke?: CommandInvoker;
};

const databaseRequirement: EnvRequirement = {
  label: "Supabase/Postgres connection",
  oneOf: [["DEVRANK_DATABASE_URL"], ["DATABASE_URL"], ["SUPABASE_DATABASE_URL"]],
};

const githubAuthRequirement: EnvRequirement = {
  label: "GitHub REST auth",
  oneOf: [
    ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    ["GITHUB_TOKEN"],
    ["GITHUB_APP_ID", "GITHUB_INSTALLATION_ID", "GITHUB_PRIVATE_KEY"],
    ["GITHUB_APP_ID", "GITHUB_INSTALLATION_ID", "GITHUB_PRIVATE_KEY_PATH"],
  ],
};

const linearAuthRequirement: EnvRequirement = {
  label: "Linear auth",
  oneOf: [["LINEAR_API_KEY"]],
};

const slackRequirement: EnvRequirement = {
  label: "Slack webhook",
  oneOf: [["SLACK_WEBHOOK_URL"]],
};

const marketSearchRequirement: EnvRequirement = {
  label: "Market benchmark search",
  oneOf: [["TAVILY_API_KEY"]],
};

const apiTokenRequirement: EnvRequirement = {
  label: "API route auth",
  oneOf: [
    ["DEVRANK_API_TOKEN"],
    [
      "DEVRANK_CONTEXT_READ_TOKEN",
      "DEVRANK_CONTEXT_WRITE_TOKEN",
      "DEVRANK_SCORE_RECOMPUTE_TOKEN",
      "DEVRANK_INGEST_TOKEN",
      "DEVRANK_SLACK_SEND_TOKEN",
      "DEVRANK_LINEAR_BACKFILL_TOKEN",
      "DEVRANK_PLANNER_TOKEN",
      "DEVRANK_HERMES_REVIEW_TOKEN",
    ],
  ],
};

const cronRequirement: EnvRequirement = {
  label: "Cron route auth",
  oneOf: [["CRON_SECRET"]],
};

const hermesRequirement: EnvRequirement = {
  label: "Hermes AI provider auth",
  oneOf: [["AI_API_KEY"], ["OPENROUTER_API_KEY"]],
};

const embeddingsRequirement: EnvRequirement = {
  label: "Embedding provider auth",
  oneOf: [["EMBEDDING_API_KEY"], ["OPENROUTER_API_KEY"]],
};

const supermemoryRequirement: EnvRequirement = {
  label: "Supermemory auth",
  oneOf: [["SUPERMEMORY_API_KEY"]],
};

const commands: CommandSpec[] = [
  {
    name: "env:check",
    description: "Show the exact environment variables needed for one feature or all features.",
    usage: "devrank env:check [--feature <database|github|linear|slack|market|context|hermes|embeddings|api|all>]",
    moduleCandidates: [],
    exportCandidates: [],
    envRequirements: [],
    buildConfig: (parsed) => ({
      feature: stringOption(parsed, "feature") ?? "all",
    }),
    localHandler: handleEnvCheck,
  },
  {
    name: "db:migrate",
    description: "Run DevRank OS migrations against Supabase/Postgres.",
    usage: "devrank db:migrate",
    moduleCandidates: [],
    exportCandidates: [],
    envRequirements: [databaseRequirement],
    buildConfig: (_parsed, env) => ({
      databaseEnv: firstPresentEnv(env, databaseRequirement),
    }),
    localHandler: handleDbMigrate,
  },
  {
    name: "db:check-vector",
    description: "Verify pgvector is installed and queryable.",
    usage: "devrank db:check-vector",
    moduleCandidates: [],
    exportCandidates: [],
    envRequirements: [databaseRequirement],
    buildConfig: (_parsed, env) => ({
      databaseEnv: firstPresentEnv(env, databaseRequirement),
    }),
    localHandler: handleDbCheckVector,
  },
  {
    name: "ingest:local-ai",
    description: "Ingest local AI-agent sessions through the local chat ingestion package.",
    usage: "devrank ingest:local-ai [--codex-sessions-dir <path>] [--source <path>] [--dry-run] [--upload-raw-chats] [--store-embeddings]",
    moduleCandidates: ["@repo/ai-chat-ingestors", "@repo/local-agent"],
    exportCandidates: ["ingestLocalAiChats", "ingestLocalAI", "ingestLocalAi", "ingestLocalChats", "run"],
    envRequirements: [],
    buildConfig: (parsed, env) => ({
      codexSessionsDir: stringOption(parsed, "codex-sessions-dir"),
      databaseEnv: firstPresentEnv(env, databaseRequirement),
      dryRun: booleanOption(parsed, "dry-run"),
      rawStorageEnabled: booleanOption(parsed, "upload-raw-chats") || envFlag(env, "DEVRANK_UPLOAD_RAW_CHATS", false),
      redactSecrets: !booleanOption(parsed, "no-redact-secrets") && envFlag(env, "DEVRANK_REDACT_SECRETS", true),
      sources: stringListOption(parsed, "source"),
      storeEmbeddings: booleanOption(parsed, "store-embeddings") || envFlag(env, "DEVRANK_STORE_EMBEDDINGS", false),
    }),
    invoke: invokeLocalAiIngest,
  },
  {
    name: "github:backfill",
    description: "Backfill repository, pull request, and issue history through the GitHub package.",
    usage: "devrank github:backfill --user <github-user> [--commit-limit <count>] [--dry-run]",
    moduleCandidates: ["@repo/github"],
    exportCandidates: ["backfillGithubUser", "backfillGitHub", "backfillGithub", "githubBackfill", "run"],
    envRequirements: [databaseRequirement, githubAuthRequirement],
    optionRequirements: [{ name: "user", label: "GitHub username or organization to backfill" }],
    buildConfig: (parsed, env) => ({
      authMode: firstPresentEnv(env, githubAuthRequirement) === "GITHUB_TOKEN" ? "token" : "github-app",
      databaseEnv: firstPresentEnv(env, databaseRequirement),
      dryRun: booleanOption(parsed, "dry-run"),
      user: stringOption(parsed, "user"),
    }),
    invoke: invokeGithubBackfill,
  },
  {
    name: "scores:recompute",
    description: "Recompute and persist a score snapshot from stored evidence.",
    usage: "devrank scores:recompute [--limit <count>] [--dry-run]",
    moduleCandidates: [],
    exportCandidates: [],
    envRequirements: [databaseRequirement],
    buildConfig: (parsed, env) => ({
      databaseEnv: firstPresentEnv(env, databaseRequirement),
      dryRun: booleanOption(parsed, "dry-run"),
      limit: numberOption(parsed, "limit", 500),
    }),
    localHandler: handleScoresRecompute,
  },
  {
    name: "linear:backfill",
    description: "Backfill Linear workspaces, projects, cycles, and issues through the Linear package.",
    usage: "devrank linear:backfill [--first <count>] [--workspace <workspace>] [--dry-run]",
    moduleCandidates: ["@repo/linear"],
    exportCandidates: ["backfillLinear", "linearBackfill", "run"],
    envRequirements: [databaseRequirement, linearAuthRequirement],
    buildConfig: (parsed, env) => ({
      databaseEnv: firstPresentEnv(env, databaseRequirement),
      dryRun: booleanOption(parsed, "dry-run"),
      first: numberOption(parsed, "first", 100),
      workspace: stringOption(parsed, "workspace"),
    }),
    invoke: invokeLinearBackfill,
  },
  {
    name: "local-daemon",
    description: "Start the local Mac daemon through the local-agent package.",
    usage: "devrank local-daemon [--config <path>] [--codex-sessions-dir <path>] [--source <path>] [--watch] [--force-skill-extraction] [--dry-run] [--upload-raw-chats] [--store-embeddings]",
    moduleCandidates: ["@repo/local-agent", "local-agent"],
    exportCandidates: ["runLocalAgent", "startLocalDaemon", "startDaemon", "runDaemon", "run"],
    envRequirements: [],
    buildConfig: (parsed, env) => ({
      configPath: stringOption(parsed, "config"),
      codexSessionsDir: stringOption(parsed, "codex-sessions-dir"),
      databaseEnv: firstPresentEnv(env, databaseRequirement),
      dryRun: booleanOption(parsed, "dry-run"),
      forceSkillExtraction: booleanOption(parsed, "force-skill-extraction"),
      rawStorageEnabled: booleanOption(parsed, "upload-raw-chats") || envFlag(env, "DEVRANK_UPLOAD_RAW_CHATS", false),
      redactSecrets: !booleanOption(parsed, "no-redact-secrets") && envFlag(env, "DEVRANK_REDACT_SECRETS", true),
      sources: stringListOption(parsed, "source"),
      storeEmbeddings: booleanOption(parsed, "store-embeddings") || envFlag(env, "DEVRANK_STORE_EMBEDDINGS", false),
      watch: booleanOption(parsed, "watch"),
    }),
    invoke: invokeLocalDaemon,
  },
  {
    name: "local-daemon:config",
    description: "Print or write the local daemon watcher and privacy config.",
    usage: "devrank local-daemon:config [--path <path>] [--codex-sessions-dir <path>] [--source <path>] [--write]",
    moduleCandidates: ["@repo/local-agent", "local-agent"],
    exportCandidates: ["createDefaultLocalAgentConfig", "writeDefaultLocalAgentConfig"],
    envRequirements: [],
    buildConfig: (parsed) => ({
      codexSessionsDir: stringOption(parsed, "codex-sessions-dir"),
      configPath: stringOption(parsed, "path"),
      sources: stringListOption(parsed, "source"),
      write: booleanOption(parsed, "write"),
    }),
    invoke: invokeLocalDaemonConfig,
  },
  {
    name: "local-daemon:launchd",
    description: "Print, write, install, uninstall, or inspect the macOS launchd agent.",
    usage: "devrank local-daemon:launchd [--print|--write|--install|--uninstall|--status] [--config <path>] [--label <label>] [--plist-path <path>] [--repo-root <path>]",
    moduleCandidates: ["@repo/local-agent", "local-agent"],
    exportCandidates: ["renderLaunchdPlist", "writeLaunchdPlist", "installLaunchdAgent", "uninstallLaunchdAgent", "getLaunchdAgentStatus"],
    envRequirements: [],
    buildConfig: (parsed) => ({
      configPath: stringOption(parsed, "config"),
      install: booleanOption(parsed, "install"),
      label: stringOption(parsed, "label"),
      plistPath: stringOption(parsed, "plist-path"),
      print: booleanOption(parsed, "print"),
      repoRoot: stringOption(parsed, "repo-root"),
      status: booleanOption(parsed, "status"),
      uninstall: booleanOption(parsed, "uninstall"),
      write: booleanOption(parsed, "write"),
    }),
    invoke: invokeLocalDaemonLaunchd,
  },
  {
    name: "hermes:skill-extract",
    description: "Run Hermes skill extraction over persisted evidence.",
    usage: "devrank hermes:skill-extract [--config <path>] [--force]",
    moduleCandidates: ["@repo/local-agent", "local-agent"],
    exportCandidates: ["runWeeklySkillExtractionIfDue", "loadLocalAgentConfig"],
    envRequirements: [databaseRequirement],
    buildConfig: (parsed, env) => ({
      configPath: stringOption(parsed, "config"),
      databaseEnv: firstPresentEnv(env, databaseRequirement),
      force: booleanOption(parsed, "force"),
    }),
    invoke: invokeHermesSkillExtract,
  },
  {
    name: "hermes:skills:create",
    description: "Create reusable Hermes skill Markdown artifacts from evidence.",
    usage: "devrank hermes:skills:create [--from-file <evidence.json>] [--output <dir>] [--limit <count>] [--generated-at <iso-date>]",
    moduleCandidates: [],
    exportCandidates: [],
    envRequirements: [],
    buildConfig: (parsed, env) => ({
      databaseEnv: firstPresentEnv(env, databaseRequirement),
      fromFile: stringOption(parsed, "from-file"),
      generatedAt: stringOption(parsed, "generated-at"),
      limit: numberOption(parsed, "limit", 500),
      outputDir: stringOption(parsed, "output") ?? "artifacts/hermes-skills",
    }),
    localHandler: handleHermesSkillsCreate,
  },
  {
    name: "planner:daily",
    description: "Generate and persist today's plan from the latest score snapshot.",
    usage: "devrank planner:daily [--date <YYYY-MM-DD>] [--urgent-linear-task <text>] [--send-slack] [--dry-run]",
    moduleCandidates: [],
    exportCandidates: [],
    envRequirements: [databaseRequirement],
    buildConfig: (parsed, env) => ({
      databaseEnv: firstPresentEnv(env, databaseRequirement),
      date: stringOption(parsed, "date"),
      dryRun: booleanOption(parsed, "dry-run"),
      sendSlack: booleanOption(parsed, "send-slack"),
      urgentLinearTask: stringOption(parsed, "urgent-linear-task"),
    }),
    localHandler: handlePlannerDaily,
  },
  {
    name: "slack:test",
    description: "Send a real Slack webhook test message.",
    usage: "devrank slack:test [--text <message>]",
    moduleCandidates: [],
    exportCandidates: [],
    envRequirements: [slackRequirement],
    buildConfig: (parsed) => ({
      text: stringOption(parsed, "text") ?? "DevRank OS Slack webhook test.",
    }),
    localHandler: handleSlackTest,
  },
  {
    name: "market:benchmark",
    description: "Run the market skill benchmark with live search results.",
    usage: "devrank market:benchmark [--query <search-query>]...",
    moduleCandidates: [],
    exportCandidates: [],
    envRequirements: [marketSearchRequirement],
    buildConfig: (parsed) => ({
      queries: stringListOption(parsed, "query") ?? [
        "SDE fresher backend roles India",
        "Java Spring Boot backend roles India",
        "Node.js backend roles India",
        "AWS Kubernetes Kafka backend roles India",
        "AI agent engineer roles India",
      ],
    }),
    localHandler: handleMarketBenchmark,
  },
];

const commandMap = new Map(commands.map((command) => [command.name, command]));
const evidenceSourceSet = new Set<EvidenceItemForCli["source"]>(evidenceSources);

async function main(argv: string[]) {
  const parsed = parseArgs(argv);

  if (!parsed.commandName || parsed.commandName === "help" || booleanOption(parsed, "help") || booleanOption(parsed, "h")) {
    printHelp(parsed.commandName && parsed.commandName !== "help" ? parsed.commandName : undefined);
    return;
  }

  const command = commandMap.get(parsed.commandName);

  if (!command) {
    throw new CliError(`Unknown command "${parsed.commandName}".\n\n${renderHelp()}`, 2);
  }

  if (booleanOption(parsed, "help") || booleanOption(parsed, "h")) {
    printHelp(command.name);
    return;
  }

  validateCommand(command, parsed, process.env);

  const handler = command.localHandler ?? await loadHandler(command);
  const result = await handler({
    command: command.name,
    config: command.buildConfig(parsed, process.env),
    env: process.env,
    options: parsed.options,
    positionals: parsed.positionals,
  });

  if (result !== undefined) {
    printResult(result);
  }
}

function validateCommand(command: CommandSpec, parsed: ParsedArgs, env: NodeJS.ProcessEnv) {
  const missingEnv = command.envRequirements.filter((requirement) => !requirementMet(requirement, env));
  const missingOptions = (command.optionRequirements ?? []).filter((requirement) => !stringOption(parsed, requirement.name));

  if (missingEnv.length === 0 && missingOptions.length === 0) {
    return;
  }

  const messages = [
    ...missingOptions.map((requirement) => `- Option --${requirement.name}: ${requirement.label}`),
    ...missingEnv.map((requirement) => `- ${requirement.label}: set ${describeRequirement(requirement)}`),
  ];

  throw new CliError(`Cannot run ${command.name}; required configuration is missing:\n${messages.join("\n")}`, 2);
}

function requirementMet(requirement: EnvRequirement, env: NodeJS.ProcessEnv) {
  return requirement.oneOf.some((group) => group.every((name) => envValue(env, name) !== undefined));
}

function firstPresentEnv(env: NodeJS.ProcessEnv, requirement: EnvRequirement) {
  for (const group of requirement.oneOf) {
    if (group.every((name) => envValue(env, name) !== undefined)) {
      return group[0];
    }
  }

  return undefined;
}

function describeRequirement(requirement: EnvRequirement) {
  return requirement.oneOf.map((group) => group.join(" + ")).join(" or ");
}

function envValue(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function envFlag(env: NodeJS.ProcessEnv, name: string, fallback: boolean) {
  const value = envValue(env, name);

  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

async function handleEnvCheck(context: CommandContext) {
  const feature = configString(context, "feature") ?? "all";
  const featureRequirements: Record<string, EnvRequirement[]> = {
    api: [apiTokenRequirement, cronRequirement],
    context: [databaseRequirement, supermemoryRequirement],
    database: [databaseRequirement],
    embeddings: [embeddingsRequirement],
    github: [databaseRequirement, githubAuthRequirement],
    hermes: [hermesRequirement],
    linear: [databaseRequirement, linearAuthRequirement],
    market: [marketSearchRequirement],
    slack: [slackRequirement],
  };
  const selected: Array<[string, EnvRequirement[] | undefined]> =
    feature === "all"
      ? Object.entries(featureRequirements)
      : [[feature, featureRequirements[feature]]];

  if (selected.some(([, requirements]) => requirements === undefined)) {
    throw new CliError(`Unknown feature "${feature}". Use one of: ${Object.keys(featureRequirements).join(", ")}, all.`, 2);
  }

  return {
    feature,
    checks: selected.map(([name, requirements]) => {
      const checkedRequirements = requirements ?? [];

      return {
        feature: name,
        ready: checkedRequirements.every((requirement) => requirementMet(requirement, context.env)),
        requirements: checkedRequirements.map((requirement) => ({
          label: requirement.label,
          configured: requirementMet(requirement, context.env),
          required: describeRequirement(requirement),
        })),
      };
    }),
  };
}

async function handleDbMigrate() {
  const result = await runDbMigrations();

  return {
    migrated: true,
    applied: result.applied,
  };
}

async function handleDbCheckVector() {
  const result = await checkVectorSupport();

  return {
    pgvector: result.extensionInstalled && result.distance === 0,
    ...result,
  };
}

async function handleScoresRecompute(context: CommandContext) {
  const sql = createSqlClient();

  try {
    const evidence = await listScoringEvidence(sql, {
      limit: configNumber(context, "limit", 500),
    });
    const snapshot = computeSdeReadinessSnapshot(evidence);

    if (!configBoolean(context, "dryRun")) {
      await insertScoreSnapshot(sql, snapshot);
    }

    return {
      dryRun: configBoolean(context, "dryRun"),
      evidenceCount: evidence.length,
      snapshot,
    };
  } finally {
    await closeSqlClient(sql);
  }
}

async function handlePlannerDaily(context: CommandContext) {
  const sql = createSqlClient();

  try {
    let snapshot = await getLatestScoreSnapshot(sql);
    const dryRun = configBoolean(context, "dryRun");
    let scoreSnapshotStatus = "current";

    if (!snapshot || !isCurrentSdeReadinessSnapshot(snapshot)) {
      const hadStaleSnapshot = snapshot !== undefined;
      const evidence = await listScoringEvidence(sql);

      if (evidence.length === 0) {
        throw new CliError(
          hadStaleSnapshot
            ? "Latest score snapshot uses an old rubric and no persisted evidence exists to refresh it."
            : "No score snapshot exists yet. Run devrank scores:recompute first.",
          2,
        );
      }

      snapshot = computeSdeReadinessSnapshot(evidence);
      scoreSnapshotStatus = hadStaleSnapshot ? "refreshed" : "created";

      if (!dryRun) {
        await insertScoreSnapshot(sql, snapshot);
      }
    }

    const plan = generateDailyPlan(
      snapshot,
      configString(context, "date"),
      configString(context, "urgentLinearTask"),
    );
    const slackText = formatDailyPlanForSlack(plan);
    const sendSlack = configBoolean(context, "sendSlack");
    let slackDelivery:
      | Awaited<ReturnType<typeof sendAuditedCliSlack>>
      | undefined;

    if (!dryRun) {
      await insertDailyPlan(sql, plan);
    }

    if (sendSlack && !dryRun) {
      slackDelivery = await sendAuditedCliSlack(sql, slackText, "planner_daily_cli", plan.date);
    }

    return {
      dryRun,
      plan,
      scoreSnapshotStatus,
      slackDelivered: slackDelivery?.slackDelivered ?? false,
      ...(sendSlack && dryRun ? { slackSkippedReason: "dry_run" } : {}),
      ...(slackDelivery ?? {}),
      slackText,
    };
  } finally {
    await closeSqlClient(sql);
  }
}

async function handleSlackTest(context: CommandContext) {
  return sendSlackMessage(configString(context, "text") ?? "DevRank OS Slack webhook test.");
}

async function sendAuditedCliSlack(
  sql: SqlClient,
  text: string,
  source: string,
  planDate: string,
) {
  const notificationId = await createSlackNotificationAttempt(sql, {
    text,
    response: {
      planDate,
      source,
      status: "pending",
    },
  });
  let slack: Awaited<ReturnType<typeof sendSlackMessage>>;

  try {
    slack = await sendSlackMessage(text);
  } catch (error) {
    await markSlackNotificationFailed(sql, {
      id: notificationId,
      errorCode: "slack_delivery_failed",
      response: {
        planDate,
        source,
      },
    }).catch(() => undefined);

    throw error;
  }

  let slackNotificationRecorded = true;

  try {
    await markSlackNotificationDelivered(sql, {
      id: notificationId,
      deliveredAt: slack.deliveredAt,
      response: {
        deliveredAt: slack.deliveredAt,
        planDate,
        provider: "slack_webhook",
        source,
        status: "delivered",
      },
    });
  } catch {
    slackNotificationRecorded = false;
  }

  return {
    slack,
    slackDelivered: true,
    slackNotificationId: notificationId,
    slackNotificationRecorded,
  };
}

async function handleMarketBenchmark(context: CommandContext) {
  return runMarketBenchmark(configStringList(context, "queries"));
}

async function handleHermesSkillsCreate(context: CommandContext) {
  const evidence = await loadReusableSkillEvidence(context);
  const artifacts = buildReusableSkillArtifacts(evidence, {
    generatedAt: configString(context, "generatedAt"),
  });

  if (artifacts.length === 0) {
    throw new CliError("No reusable skill artifacts could be created from the provided evidence.", 2);
  }

  const outputDir = resolve(configString(context, "outputDir") ?? "artifacts/hermes-skills");
  const result = await writeReusableSkillArtifacts(artifacts, outputDir);

  return {
    evidenceCount: evidence.length,
    artifactCount: artifacts.length,
    ...result,
  };
}

async function loadReusableSkillEvidence(context: CommandContext): Promise<Awaited<ReturnType<typeof listEvidenceItems>>> {
  const fromFile = configString(context, "fromFile");

  if (fromFile) {
    return parseEvidenceFile(await readFile(resolve(fromFile), "utf8"));
  }

  if (!requirementMet(databaseRequirement, context.env)) {
    throw new CliError(
      `Cannot run ${context.command}; set ${describeRequirement(databaseRequirement)} or pass --from-file <evidence.json>.`,
      2,
    );
  }

  const sql = createSqlClient();

  try {
    return await listEvidenceItems(sql, {
      limit: configNumber(context, "limit", 500),
    });
  } finally {
    await closeSqlClient(sql);
  }
}

async function loadHandler(command: CommandSpec): Promise<CommandHandler> {
  const missingModules: string[] = [];

  for (const moduleName of command.moduleCandidates) {
    try {
      const moduleExports = (await import(moduleName)) as ModuleExports;
      const invoker = command.invoke;

      if (invoker) {
        return (context) => invoker(moduleExports, context, moduleName);
      }

      const handler = findHandler(moduleExports, command.exportCandidates);

      if (!handler) {
        throw new CliError(
          `Package API "${moduleName}" is available, but ${command.name} needs one of these function exports: ${command.exportCandidates.join(", ")}.`,
        );
      }

      return (context) => handler(context);
    } catch (error) {
      if (isMissingTargetModule(error, moduleName)) {
        missingModules.push(moduleName);
        continue;
      }

      throw error;
    }
  }

  throw new CliError(
    [
      `Command ${command.name} is wired, but no package API is available yet.`,
      `Tried: ${command.moduleCandidates.join(", ")}.`,
      `Expected one of these exports: ${command.exportCandidates.join(", ")}.`,
    ].join("\n"),
  );
}

async function invokeLocalAiIngest(moduleExports: ModuleExports, context: CommandContext, moduleName: string) {
  const packageHandler = optionalFunction(moduleExports, ["ingestLocalAiChats"]);

  if (packageHandler) {
    const codexDir = codexSessionsDir(context);
    const result = await packageHandler({
      codexSessionsDir: codexDir,
      rawStorageEnabled: configBoolean(context, "rawStorageEnabled"),
      redactSecrets: configBoolean(context, "redactSecrets"),
      sourceRoots: configOptionalStringList(context, "sources"),
      storeEmbeddings: configBoolean(context, "storeEmbeddings"),
    });

    return persistIngestionResult(context, result, `local_session:${codexDir}`);
  }

  const handler = requiredFunction(
    moduleExports,
    ["ingestLocalAI", "ingestLocalAi", "ingestLocalChats", "run"],
    moduleName,
    context.command,
  );

  return handler(context);
}

async function invokeGithubBackfill(moduleExports: ModuleExports, context: CommandContext, moduleName: string) {
  const directHandler = optionalFunction(moduleExports, ["backfillGitHub", "backfillGithub", "githubBackfill", "run"]);

  if (directHandler) {
    return persistGithubBackfillResult(context, await directHandler(context));
  }

  const token = envValue(context.env, "GITHUB_PERSONAL_ACCESS_TOKEN") ?? envValue(context.env, "GITHUB_TOKEN");

  if (!token) {
    throw new CliError(
      [
        `Package API "${moduleName}" exposes backfillGithubUser, which requires token-based REST auth.`,
        "Set GITHUB_PERSONAL_ACCESS_TOKEN or GITHUB_TOKEN, or add a direct backfillGitHub export that supports GitHub App credentials.",
      ].join("\n"),
      2,
    );
  }

  const createGithubClient = requiredFunction(moduleExports, ["createGithubClient"], moduleName, context.command);
  const backfillGithubUser = requiredFunction(moduleExports, ["backfillGithubUser"], moduleName, context.command);
  const client = createGithubClient({
    ...context.env,
    GITHUB_PERSONAL_ACCESS_TOKEN: token,
  });

  return persistGithubBackfillResult(
    context,
    await backfillGithubUser(client, configString(context, "user"), {
      commitLimitPerRepo: configNumber(context, "commit-limit", 100),
    }),
  );
}

async function persistGithubBackfillResult(context: CommandContext, result: unknown) {
  if (configBoolean(context, "dryRun") || !isGithubBackfillLike(result)) {
    return result;
  }

  const sql = createSqlClient();

  try {
    const written = await upsertGithubBackfill(sql, result);
    await insertIngestionRun(sql, {
      source: "github_backfill",
      status: "success",
      summary: `Imported ${written.repos} GitHub repo(s), ${written.pullRequests} pull request(s), ${written.commits} commit(s), and ${written.repoProfiles} repo profile(s).`,
    });

    return {
      ...result,
      written,
    };
  } catch (error) {
    await insertIngestionRun(sql, {
      source: "github_backfill",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await closeSqlClient(sql);
  }
}

async function invokeLinearBackfill(moduleExports: ModuleExports, context: CommandContext, moduleName: string) {
  const directHandler = optionalFunction(moduleExports, ["linearBackfill", "run"]);

  if (directHandler) {
    return persistLinearBackfillResult(context, await directHandler(context));
  }

  const backfillLinear = requiredFunction(moduleExports, ["backfillLinear"], moduleName, context.command);
  return persistLinearBackfillResult(context, await backfillLinear(configNumber(context, "first", 100)));
}

async function persistLinearBackfillResult(context: CommandContext, result: unknown) {
  if (configBoolean(context, "dryRun") || !isLinearBackfillLike(result)) {
    return result;
  }

  const sql = createSqlClient();

  try {
    const written = await upsertLinearBackfill(sql, result);
    await insertIngestionRun(sql, {
      source: "linear_backfill",
      status: "success",
      summary: `Imported ${written.projects} Linear project(s) and ${written.issues} issue(s).`,
    });

    return {
      ...result,
      written,
    };
  } catch (error) {
    await insertIngestionRun(sql, {
      source: "linear_backfill",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await closeSqlClient(sql);
  }
}

function invokeLocalDaemon(moduleExports: ModuleExports, context: CommandContext, moduleName: string) {
  const directHandler = requiredFunction(
    moduleExports,
    ["runLocalAgent", "startLocalDaemon", "startDaemon", "runDaemon", "run"],
    moduleName,
    context.command,
  );

  return directHandler({
    codexSessionsDir: codexSessionsDir(context),
    configPath: configString(context, "configPath"),
    forceSkillExtraction: configBoolean(context, "forceSkillExtraction"),
    persist: !configBoolean(context, "dryRun"),
    privacy: {
      uploadRawChats: configBoolean(context, "rawStorageEnabled"),
      redactSecrets: configBoolean(context, "redactSecrets"),
      storeEmbeddings: configBoolean(context, "storeEmbeddings"),
    },
    sources: configOptionalStringList(context, "sources"),
    watch: configBoolean(context, "watch"),
  });
}

function invokeLocalDaemonConfig(moduleExports: ModuleExports, context: CommandContext, moduleName: string) {
  const options = {
    codexSessionsDir: configString(context, "codexSessionsDir"),
    configPath: configString(context, "configPath"),
    sources: configOptionalStringList(context, "sources"),
  };

  if (configBoolean(context, "write")) {
    const writeDefaultLocalAgentConfig = requiredFunction(
      moduleExports,
      ["writeDefaultLocalAgentConfig"],
      moduleName,
      context.command,
    );

    return writeDefaultLocalAgentConfig(options);
  }

  const createDefaultLocalAgentConfig = requiredFunction(
    moduleExports,
    ["createDefaultLocalAgentConfig"],
    moduleName,
    context.command,
  );

  return {
    configPath: configString(context, "configPath") ?? moduleStringExport(moduleExports, "defaultLocalAgentConfigPath"),
    config: createDefaultLocalAgentConfig(options),
  };
}

function invokeLocalDaemonLaunchd(moduleExports: ModuleExports, context: CommandContext, moduleName: string) {
  const launchdOptions = {
    configPath: configString(context, "configPath"),
    label: configString(context, "label"),
    plistPath: configString(context, "plistPath"),
    repoRoot: configString(context, "repoRoot"),
  };
  const selectedActions = [
    configBoolean(context, "write"),
    configBoolean(context, "install"),
    configBoolean(context, "uninstall"),
    configBoolean(context, "status"),
  ].filter(Boolean);

  if (selectedActions.length > 1) {
    throw new CliError("Choose only one launchd action: --write, --install, --uninstall, or --status.", 2);
  }

  if (configBoolean(context, "write")) {
    return requiredFunction(moduleExports, ["writeLaunchdPlist"], moduleName, context.command)(launchdOptions);
  }

  if (configBoolean(context, "install")) {
    return requiredFunction(moduleExports, ["installLaunchdAgent"], moduleName, context.command)(launchdOptions);
  }

  if (configBoolean(context, "uninstall")) {
    return requiredFunction(moduleExports, ["uninstallLaunchdAgent"], moduleName, context.command)(launchdOptions);
  }

  if (configBoolean(context, "status")) {
    return requiredFunction(moduleExports, ["getLaunchdAgentStatus"], moduleName, context.command)(launchdOptions);
  }

  return requiredFunction(moduleExports, ["renderLaunchdPlist"], moduleName, context.command)(launchdOptions);
}

async function invokeHermesSkillExtract(moduleExports: ModuleExports, context: CommandContext, moduleName: string) {
  const loadLocalAgentConfig = requiredFunction(moduleExports, ["loadLocalAgentConfig"], moduleName, context.command);
  const runWeeklySkillExtractionIfDue = requiredFunction(
    moduleExports,
    ["runWeeklySkillExtractionIfDue"],
    moduleName,
    context.command,
  );
  const config = await loadLocalAgentConfig({
    configPath: configString(context, "configPath"),
  }) as {
    automation: {
      weeklySkillExtraction: unknown;
    };
  };

  return runWeeklySkillExtractionIfDue({
    config: config.automation.weeklySkillExtraction,
    force: configBoolean(context, "force"),
    persist: true,
  });
}

async function persistIngestionResult(context: CommandContext, result: unknown, source: string) {
  if (configBoolean(context, "dryRun") || !isIngestionLike(result)) {
    return result;
  }

  const sql = createSqlClient();

  try {
    const writtenEvidence = await upsertEvidenceItems(sql, result.evidence);
    const writtenEmbeddings = Array.isArray(result.embeddings)
      ? await upsertEvidenceEmbeddings(sql, result.embeddings)
      : 0;
    const writtenTranscripts = Array.isArray(result.transcripts)
      ? await upsertAiChatSessions(sql, result.transcripts)
      : 0;
    await insertIngestionRun(sql, {
      source,
      status: "success",
      summary: `Imported ${result.sessions.length} session(s), ${result.evidence.length} evidence item(s), ${writtenEmbeddings} embedding(s), and ${writtenTranscripts} transcript(s).`,
    });

    return {
      ...result,
      writtenEmbeddings,
      writtenEvidence,
      writtenTranscripts,
    };
  } catch (error) {
    await insertIngestionRun(sql, {
      source,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await closeSqlClient(sql);
  }
}

function isIngestionLike(value: unknown): value is {
  evidence: Parameters<typeof upsertEvidenceItems>[1];
  embeddings?: Parameters<typeof upsertEvidenceEmbeddings>[1];
  sessions: unknown[];
  transcripts?: Parameters<typeof upsertAiChatSessions>[1];
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record.evidence) && Array.isArray(record.sessions);
}

function isGithubBackfillLike(value: unknown): value is Parameters<typeof upsertGithubBackfill>[1] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record.repos) &&
    Array.isArray(record.pullRequests) &&
    (record.commits === undefined || Array.isArray(record.commits)) &&
    (record.repoProfiles === undefined || Array.isArray(record.repoProfiles));
}

function isLinearBackfillLike(value: unknown): value is Parameters<typeof upsertLinearBackfill>[1] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record.projects) && Array.isArray(record.issues);
}

function codexSessionsDir(context: CommandContext) {
  const configured = configString(context, "codexSessionsDir");

  if (configured) {
    return configured;
  }

  const sources = configStringList(context, "sources");
  return sources.find((source) => source.includes(".codex")) ?? join(homedir(), ".codex", "sessions");
}

function configString(context: CommandContext, key: string) {
  const value = context.config[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return undefined;
}

function configNumber(context: CommandContext, key: string, fallback: number) {
  const value = context.config[key];
  return typeof value === "number" ? value : fallback;
}

function configBoolean(context: CommandContext, key: string) {
  return context.config[key] === true;
}

function configStringList(context: CommandContext, key: string) {
  const value = context.config[key];

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  return [];
}

function configOptionalStringList(context: CommandContext, key: string) {
  const value = configStringList(context, key);

  return value.length > 0 ? value : undefined;
}

function moduleStringExport(moduleExports: ModuleExports, key: string) {
  const value = moduleExports[key];

  return typeof value === "string" ? value : undefined;
}

function optionalFunction(moduleExports: ModuleExports, candidates: string[]) {
  return findHandler(moduleExports, candidates);
}

function requiredFunction(moduleExports: ModuleExports, candidates: string[], moduleName: string, commandName: string) {
  const handler = optionalFunction(moduleExports, candidates);

  if (!handler) {
    throw new CliError(
      `Package API "${moduleName}" is available, but ${commandName} needs one of these function exports: ${candidates.join(", ")}.`,
    );
  }

  return handler;
}

function findHandler(moduleExports: ModuleExports, candidates: string[]): UnknownFunction | undefined {
  for (const exportName of candidates) {
    const value = moduleExports[exportName];

    if (typeof value === "function") {
      return value as UnknownFunction;
    }
  }

  const defaultExport = moduleExports.default;

  if (typeof defaultExport === "function") {
    return defaultExport as UnknownFunction;
  }

  return undefined;
}

function isMissingTargetModule(error: unknown, moduleName: string) {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = "code" in error ? String(error.code) : undefined;
  return code === "ERR_MODULE_NOT_FOUND" && error.message.includes(moduleName);
}

function printResult(result: unknown) {
  if (typeof result === "string") {
    console.log(result);
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

function printHelp(commandName?: string) {
  console.log(renderHelp(commandName));
}

function parseEvidenceFile(contents: string): Awaited<ReturnType<typeof listEvidenceItems>> {
  const parsed = JSON.parse(contents) as unknown;
  const evidence = evidenceArrayFromJson(parsed);

  return evidence.map(parseEvidenceItem);
}

function evidenceArrayFromJson(parsed: unknown) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (typeof parsed === "object" && parsed !== null) {
    const record = parsed as Record<string, unknown>;

    if (Array.isArray(record.evidence)) {
      return record.evidence;
    }
  }

  throw new CliError("Evidence file must contain an evidence array or an object with an evidence array.", 2);
}

function parseEvidenceItem(value: unknown, index: number): EvidenceItemForCli {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CliError(`Evidence item at index ${index} must be an object.`, 2);
  }

  const record = value as Record<string, unknown>;
  const id = requiredJsonString(record, "id", index);
  const source = requiredJsonString(record, "source", index);
  const title = requiredJsonString(record, "title", index);
  const summary = requiredJsonString(record, "summary", index);
  const occurredAt = requiredJsonString(record, "occurredAt", index);
  const metadata = optionalJsonRecord(record.metadata);
  const url = typeof record.url === "string" && record.url.trim().length > 0 ? record.url : undefined;

  return {
    id,
    source: parseEvidenceSource(source, index),
    title,
    summary,
    occurredAt,
    metadata,
    ...(url ? { url } : {}),
  };
}

function parseEvidenceSource(source: string, index: number): EvidenceItemForCli["source"] {
  if (!evidenceSourceSet.has(source as EvidenceItemForCli["source"])) {
    throw new CliError(`Evidence item at index ${index} has unsupported source "${source}".`, 2);
  }

  return source as EvidenceItemForCli["source"];
}

function requiredJsonString(record: Record<string, unknown>, key: string, index: number) {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CliError(`Evidence item at index ${index} must include a non-empty string "${key}".`, 2);
  }

  return value;
}

function optionalJsonRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function renderHelp(commandName?: string) {
  if (commandName) {
    const command = commandMap.get(commandName);

    if (!command) {
      return renderHelp();
    }

    const lines = [
      command.description,
      "",
      `Usage: ${command.usage}`,
      "",
      "Required environment:",
      ...command.envRequirements.map((requirement) => `  ${requirement.label}: ${describeRequirement(requirement)}`),
    ];

    if (command.moduleCandidates.length > 0) {
      lines.push(
        "",
        `Package API: ${command.moduleCandidates.join(" or ")} exporting ${command.exportCandidates.join(" or ")}.`,
      );
    }

    return lines.join("\n");
  }

  return [
    "DevRank OS CLI",
    "",
    "Usage: devrank <command> [options]",
    "",
    "Commands:",
    ...commands.map((command) => `  ${command.name.padEnd(18)} ${command.description}`),
    "",
    "Run devrank <command> --help for command-specific requirements.",
  ].join("\n");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = error.exitCode;
    return;
  }

  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error(String(error));
  process.exitCode = 1;
});
