import { execFile } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defaultLocalAgentConfigPath } from "./config.js";

const execFileAsync = promisify(execFile);

export const defaultLaunchdLabel = "com.devrank.local-agent";

export interface LaunchdAgentOptions {
  configPath?: string;
  environmentVariables?: Record<string, string>;
  keepAlive?: boolean;
  label?: string;
  logDirectory?: string;
  nodePath?: string;
  plistPath?: string;
  repoRoot?: string;
  runAtLoad?: boolean;
}

export interface LaunchdWriteResult {
  label: string;
  plist: string;
  plistPath: string;
}

export function defaultLaunchdPlistPath(label = defaultLaunchdLabel) {
  return join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

export function defaultLaunchdLogDirectory() {
  return join(homedir(), "Library", "Logs", "DevRankOS");
}

export function renderLaunchdPlist(options: LaunchdAgentOptions = {}) {
  const resolved = resolveLaunchdOptions(options);
  // Launchd consumes this plist on macOS, so OS-consumed paths are normalized
  // to POSIX separators (also fixes plists generated on Windows CI).
  // Caller-supplied environmentVariables stay verbatim: they are opaque values
  // consumed by the daemon process, not by launchd, and normalizing them
  // could corrupt secrets containing backslashes.
  const programArguments = [
    toPosixPath(resolved.nodePath),
    toPosixPath(join(resolved.repoRoot, "apps", "local-agent", "dist", "index.js")),
    "--config",
    toPosixPath(resolved.configPath),
    "--watch",
  ];
  const environmentVariables = {
    DEVRANK_LOCAL_AGENT_LOG_PATH: toPosixPath(join(resolved.logDirectory, "local-agent.log")),
    NODE_ENV: "production",
    ...(resolved.environmentVariables ?? {}),
  };

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    "<dict>",
    keyString("Label", resolved.label),
    keyArray("ProgramArguments", programArguments),
    keyString("WorkingDirectory", toPosixPath(resolved.repoRoot)),
    keyDict("EnvironmentVariables", environmentVariables),
    keyBoolean("RunAtLoad", resolved.runAtLoad),
    keyBoolean("KeepAlive", resolved.keepAlive),
    keyString("StandardOutPath", "/dev/null"),
    keyString("StandardErrorPath", "/dev/null"),
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export async function writeLaunchdPlist(options: LaunchdAgentOptions = {}): Promise<LaunchdWriteResult> {
  const resolved = resolveLaunchdOptions(options);
  const plist = renderLaunchdPlist(resolved);
  await mkdir(dirname(resolved.plistPath), { recursive: true });
  await mkdir(resolved.logDirectory, { recursive: true });
  // The plist can carry secret-bearing environment variables, so lock it down
  // like the log file (best-effort on Windows).
  await writeFile(resolved.plistPath, plist, { encoding: "utf8", mode: 0o600 });
  await chmod(resolved.plistPath, 0o600).catch(() => undefined);

  return {
    label: resolved.label,
    plist,
    plistPath: resolved.plistPath,
  };
}

export async function installLaunchdAgent(options: LaunchdAgentOptions = {}) {
  requireDarwin("install launchd agent");
  const written = await writeLaunchdPlist(options);
  const target = launchctlTarget();

  await execLaunchctl(["bootout", target, written.plistPath]).catch(() => undefined);
  await execLaunchctl(["bootstrap", target, written.plistPath]);
  await execLaunchctl(["enable", `${target}/${written.label}`]).catch(() => undefined);

  return {
    ...written,
    installed: true,
    target,
  };
}

export async function uninstallLaunchdAgent(options: LaunchdAgentOptions = {}) {
  requireDarwin("uninstall launchd agent");
  const resolved = resolveLaunchdOptions(options);
  const target = launchctlTarget();

  await execLaunchctl(["bootout", target, resolved.plistPath]).catch(() => undefined);
  await rm(resolved.plistPath, { force: true });

  return {
    label: resolved.label,
    plistPath: resolved.plistPath,
    removed: true,
    target,
  };
}

export async function getLaunchdAgentStatus(options: LaunchdAgentOptions = {}) {
  requireDarwin("check launchd agent status");
  const resolved = resolveLaunchdOptions(options);
  const target = launchctlTarget();

  try {
    const output = await execLaunchctl(["print", `${target}/${resolved.label}`]);
    return {
      label: resolved.label,
      loaded: true,
      output,
      target,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      label: resolved.label,
      loaded: false,
      target,
    };
  }
}

function resolveLaunchdOptions(options: LaunchdAgentOptions) {
  const label = options.label ?? defaultLaunchdLabel;
  const logDirectory = options.logDirectory ?? defaultLaunchdLogDirectory();

  return {
    configPath: options.configPath ?? defaultLocalAgentConfigPath,
    environmentVariables: options.environmentVariables,
    keepAlive: options.keepAlive ?? true,
    label,
    logDirectory,
    nodePath: options.nodePath ?? process.execPath,
    plistPath: options.plistPath ?? defaultLaunchdPlistPath(label),
    repoRoot: options.repoRoot ?? inferredRepoRoot(),
    runAtLoad: options.runAtLoad ?? true,
  };
}

function inferredRepoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

function keyString(key: string, value: string) {
  return [`  <key>${escapeXml(key)}</key>`, `  <string>${escapeXml(value)}</string>`].join("\n");
}

function keyBoolean(key: string, value: boolean) {
  return [`  <key>${escapeXml(key)}</key>`, `  <${value ? "true" : "false"}/>`].join("\n");
}

function keyArray(key: string, values: string[]) {
  return [
    `  <key>${escapeXml(key)}</key>`,
    "  <array>",
    ...values.map((value) => `    <string>${escapeXml(value)}</string>`),
    "  </array>",
  ].join("\n");
}

function keyDict(key: string, values: Record<string, string>) {
  return [
    `  <key>${escapeXml(key)}</key>`,
    "  <dict>",
    ...Object.entries(values).flatMap(([name, value]) => [
      `    <key>${escapeXml(name)}</key>`,
      `    <string>${escapeXml(value)}</string>`,
    ]),
    "  </dict>",
  ].join("\n");
}

function toPosixPath(value: string) {
  return value.replaceAll("\\", "/");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function requireDarwin(operation: string) {
  if (process.platform !== "darwin") {
    throw new Error(`Cannot ${operation}; launchd is only available on macOS.`);
  }
}

function launchctlTarget() {
  const uid = process.getuid?.();

  if (uid === undefined) {
    throw new Error("Cannot resolve launchd user target on this platform.");
  }

  return `gui/${uid}`;
}

async function execLaunchctl(args: string[]) {
  const { stderr, stdout } = await execFileAsync("launchctl", args);

  return [stdout, stderr].filter(Boolean).join("\n");
}
