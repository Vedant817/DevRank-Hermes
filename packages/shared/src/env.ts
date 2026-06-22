import { z } from "zod";
import { ConfigurationError } from "./errors.js";

const nonEmptyString = z.string().trim().min(1);

export const runtimeEnvSchema = z.object({
  DATABASE_URL: nonEmptyString.optional(),
  DEVRANK_DATABASE_URL: nonEmptyString.optional(),
  SUPABASE_DATABASE_URL: nonEmptyString.optional(),
  SUPABASE_URL: nonEmptyString.optional(),
  SUPABASE_ANON_KEY: nonEmptyString.optional(),
  SUPABASE_SERVICE_ROLE_KEY: nonEmptyString.optional(),
  DEVRANK_API_TOKEN: nonEmptyString.optional(),
  GITHUB_APP_ID: nonEmptyString.optional(),
  GITHUB_INSTALLATION_ID: nonEmptyString.optional(),
  GITHUB_PRIVATE_KEY: nonEmptyString.optional(),
  GITHUB_PRIVATE_KEY_PATH: nonEmptyString.optional(),
  GITHUB_WEBHOOK_SECRET: nonEmptyString.optional(),
  GITHUB_PERSONAL_ACCESS_TOKEN: nonEmptyString.optional(),
  GITHUB_TOKEN: nonEmptyString.optional(),
  LINEAR_API_KEY: nonEmptyString.optional(),
  LINEAR_WEBHOOK_SECRET: nonEmptyString.optional(),
  SLACK_WEBHOOK_URL: nonEmptyString.optional(),
  OPENROUTER_API_KEY: nonEmptyString.optional(),
  OPENROUTER_BASE_URL: nonEmptyString.optional(),
  HERMES_MODEL: nonEmptyString.optional(),
  HERMES_HTTP_REFERER: nonEmptyString.optional(),
  HERMES_TITLE: nonEmptyString.optional(),
  EXA_API_KEY: nonEmptyString.optional(),
  TAVILY_API_KEY: nonEmptyString.optional(),
  FIRECRAWL_API_KEY: nonEmptyString.optional(),
  SUPERMEMORY_API_KEY: nonEmptyString.optional(),
  SUPERMEMORY_PROJECT_ID: nonEmptyString.optional(),
  CRON_SECRET: nonEmptyString.optional(),
  LOCAL_AGENT_UPLOAD_RAW_CHATS: z.enum(["true", "false"]).default("false"),
  LOCAL_AGENT_REDACT_SECRETS: z.enum(["true", "false"]).default("true"),
  CONTEXT_PROVIDER: z
    .enum(["supabase", "supermemory", "combined"])
    .default("supabase"),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function readRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const parsed = runtimeEnvSchema.safeParse(source);

  if (!parsed.success) {
    throw new ConfigurationError(z.prettifyError(parsed.error));
  }

  return parsed.data;
}

export function requireEnv<const Keys extends Array<keyof RuntimeEnv>>(
  env: RuntimeEnv,
  keys: Keys,
  feature: string,
): { [Key in Keys[number]]: string } {
  const values = {} as { [Key in Keys[number]]: string };
  const missing: string[] = [];

  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      const typedKey = key as Keys[number];
      values[typedKey] = value;
    } else {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new ConfigurationError(
      `${feature} is not configured. Missing: ${missing.join(", ")}`,
    );
  }

  return values;
}
