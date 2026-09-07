import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  claimApiRateLimit,
  closeSqlClient,
  createSqlClient,
} from "@repo/db";
import {
  resolveSingleUserOwner,
  scopeContainerTagsForOwner,
  isPlaceholderSecret,
} from "@repo/shared";
import { NextResponse } from "next/server";

type JsonObject = Record<string, unknown>;

type ReadJsonResult =
  | { ok: true; value: JsonObject }
  | { ok: false; response: NextResponse };

type ReadRawBodyResult =
  | { ok: true; buffer: Buffer; text: string }
  | { ok: false; response: NextResponse };

type ReadBodyOptions = {
  maxBytes?: number;
};

type ApiAuthOptions = {
  label?: string;
  scopedEnvName?: string;
};

export type RateLimitStore = (input: {
  bucketKey: string;
  windowMs: number;
}) => Promise<{
  count: number;
  resetAt: string;
}>;

type RateLimitOptions = {
  key: string;
  limit: number;
  store?: RateLimitStore;
  windowMs: number;
};

const DEFAULT_JSON_MAX_BYTES = 128 * 1024;
const DEFAULT_RAW_MAX_BYTES = 512 * 1024;
const RATE_LIMIT_STORE_SYMBOL = Symbol.for("devrank.rateLimitStore");

export function jsonOk(payload: JsonObject = {}, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: JsonObject,
) {
  const error: JsonObject = { code, message };

  if (details !== undefined) {
    error.details = details;
  }

  return NextResponse.json({ ok: false, error }, { status });
}

export function methodNotAllowed(allowedMethods: string[]) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: `Use ${allowedMethods.join(" or ")} for this route.`,
      },
    },
    {
      status: 405,
      headers: {
        Allow: allowedMethods.join(", "),
      },
    },
  );
}

export function packageUnavailable(
  packageName: string,
  workflowName: string,
  details: JsonObject = {},
) {
  return jsonError(
    501,
    "package_workflow_unavailable",
    `${workflowName} cannot run because ${packageName} is not implemented in this checkout.`,
    {
      packageName,
      workflowName,
      ...details,
    },
  );
}

export async function readJsonObject(
  request: Request,
  options: ReadBodyOptions = {},
): Promise<ReadJsonResult> {
  const body = await readLimitedBody(request, options.maxBytes ?? DEFAULT_JSON_MAX_BYTES);

  if (!body.ok) {
    return body;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(body.text);
  } catch {
    return {
      ok: false,
      response: jsonError(400, "invalid_json", "Request body must be valid JSON."),
    };
  }

  if (!isJsonObject(payload)) {
    return {
      ok: false,
      response: jsonError(400, "invalid_body", "Request body must be a JSON object."),
    };
  }

  return { ok: true, value: payload };
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getOptionalString(
  body: JsonObject,
  key: string,
): string | undefined {
  const value = body[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

export function getRequiredString(
  body: JsonObject,
  key: string,
  maxLength: number,
) {
  const value = getOptionalString(body, key);

  if (value === undefined) {
    return {
      ok: false as const,
      response: jsonError(400, "missing_field", `${key} is required.`, { field: key }),
    };
  }

  if (value.length > maxLength) {
    return {
      ok: false as const,
      response: jsonError(400, "field_too_long", `${key} is too long.`, {
        field: key,
        maxLength,
      }),
    };
  }

  return { ok: true as const, value };
}

export function getOptionalInteger(
  body: JsonObject,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
) {
  const value = body[key];

  if (value === undefined) {
    return { ok: true as const, value: defaultValue };
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_field", `${key} must be an integer from ${min} to ${max}.`, {
        field: key,
        min,
        max,
      }),
    };
  }

  return { ok: true as const, value };
}

export function getOptionalObject(
  body: JsonObject,
  key: string,
) {
  const value = body[key];

  if (value === undefined) {
    return { ok: true as const, value: undefined };
  }

  if (!isJsonObject(value)) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_field", `${key} must be a JSON object.`, { field: key }),
    };
  }

  return { ok: true as const, value };
}

export function parseOptionalStringArray(
  value: unknown,
  options: {
    field: string;
    maxItems: number;
    maxLength: number;
  },
) {
  if (value === undefined) {
    return { ok: true as const, value: undefined };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_field", `${options.field} must be an array of strings.`, {
        field: options.field,
      }),
    };
  }

  if (value.length > options.maxItems) {
    return {
      ok: false as const,
      response: jsonError(400, "array_too_long", `${options.field} has too many items.`, {
        field: options.field,
        maxItems: options.maxItems,
      }),
    };
  }

  const items: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];

    if (typeof item !== "string") {
      return {
        ok: false as const,
        response: jsonError(400, "invalid_field", `${options.field} must contain only strings.`, {
          field: options.field,
          index,
        }),
      };
    }

    const trimmed = item.trim();

    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.length > options.maxLength) {
      return {
        ok: false as const,
        response: jsonError(400, "field_too_long", `${options.field} item is too long.`, {
          field: options.field,
          index,
          maxLength: options.maxLength,
        }),
      };
    }

    if (!items.includes(trimmed)) {
      items.push(trimmed);
    }
  }

  return { ok: true as const, value: items.length > 0 ? items : undefined };
}

export function requireApiAuth(
  request: Request,
  options: ApiAuthOptions = {},
) {
  if (
    options.scopedEnvName !== undefined &&
    getEnvValue(options.scopedEnvName) !== undefined
  ) {
    const authError = requireBearerSecret(request, [{
      envName: options.scopedEnvName,
      label: options.label ?? "scoped API token",
    }]);

    return authError ?? requireOwnerBoundary();
  }

  const authError = requireBearerSecret(request, [{
    envName: "DEVRANK_API_TOKEN",
    label: options.label ?? "API token",
  }]);

  return authError ?? requireOwnerBoundary();
}

export function requireCronAuth(request: Request) {
  const authError = requireBearerSecret(request, [{
    envName: "CRON_SECRET",
    label: "cron secret",
  }]);

  return authError ?? requireOwnerBoundary();
}

export function getOwnerScopedContainerTags(containerTags: string[] | undefined) {
  try {
    return {
      ok: true as const,
      value: scopeContainerTagsForOwner(containerTags),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Owner scope is invalid.";
    const mismatch = message.includes("does not match");

    return {
      ok: false as const,
      response: jsonError(
        mismatch ? 403 : 503,
        mismatch ? "owner_scope_mismatch" : "owner_not_configured",
        message,
      ),
    };
  }
}

export function getSingleUserOwner() {
  try {
    return { ok: true as const, value: resolveSingleUserOwner() };
  } catch (error) {
    return {
      ok: false as const,
      response: jsonError(
        503,
        "owner_not_configured",
        error instanceof Error ? error.message : "Single-user owner is not configured.",
      ),
    };
  }
}

export function getRequiredEnv(name: string) {
  const value = getEnvValue(name);

  if (value === undefined) {
    return {
      ok: false as const,
      response: jsonError(503, "missing_env", `${name} is not configured.`, {
        env: name,
      }),
    };
  }

  return { ok: true as const, value };
}

export function verifyHmacHex(
  rawBody: Buffer,
  secret: string,
  signatureHeader: string | null,
  options: {
    codePrefix?: string;
    expectedPrefix?: string;
    headerName: string;
  },
) {
  if (signatureHeader === null || signatureHeader.trim().length === 0) {
    return {
      ok: false as const,
      response: jsonError(401, `${options.codePrefix ?? "webhook"}_signature_missing`, `${options.headerName} is required.`),
    };
  }

  const signature = normalizeHexSignature(signatureHeader, options.expectedPrefix);

  if (signature === undefined) {
    return {
      ok: false as const,
      response: jsonError(
        401,
        `${options.codePrefix ?? "webhook"}_signature_invalid`,
        `${options.headerName} must be a valid SHA-256 hex signature.`,
      ),
    };
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  if (!safeCompareHex(expected, signature)) {
    return {
      ok: false as const,
      response: jsonError(401, `${options.codePrefix ?? "webhook"}_signature_mismatch`, "Webhook signature verification failed."),
    };
  }

  return { ok: true as const };
}

export async function readRawBody(
  request: Request,
  options: ReadBodyOptions = {},
): Promise<ReadRawBodyResult> {
  return readLimitedBody(request, options.maxBytes ?? DEFAULT_RAW_MAX_BYTES);
}

export function parseWebhookJson(rawBody: string) {
  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_json", "Webhook body must be valid JSON."),
    };
  }

  if (!isJsonObject(payload)) {
    return {
      ok: false as const,
      response: jsonError(400, "invalid_body", "Webhook body must be a JSON object."),
    };
  }

  return { ok: true as const, value: payload };
}

export async function rateLimit(
  request: Request,
  options: RateLimitOptions,
) {
  const identity = clientIdentity(request);
  const store = options.store ?? configuredRateLimitStore();
  let bucket: Awaited<ReturnType<RateLimitStore>>;

  try {
    bucket = await store({
      bucketKey: `${options.key}:${identity}`,
      windowMs: options.windowMs,
    });
  } catch {
    return jsonError(
      503,
      "rate_limit_unavailable",
      "Request enforcement is temporarily unavailable.",
    );
  }

  if (bucket.count <= options.limit) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((new Date(bucket.resetAt).getTime() - Date.now()) / 1_000),
  );
  const response = jsonError(429, "rate_limited", "Too many requests. Retry after the current rate limit window.", {
    retryAfterSeconds,
  });
  response.headers.set("Retry-After", String(retryAfterSeconds));

  return response;
}

export function setRateLimitStore(store: RateLimitStore | undefined) {
  const globalScope = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_SYMBOL]?: RateLimitStore;
  };
  const previous = globalScope[RATE_LIMIT_STORE_SYMBOL];
  globalScope[RATE_LIMIT_STORE_SYMBOL] = store;

  return () => {
    globalScope[RATE_LIMIT_STORE_SYMBOL] = previous;
  };
}

function configuredRateLimitStore() {
  const globalScope = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_SYMBOL]?: RateLimitStore;
  };

  return globalScope[RATE_LIMIT_STORE_SYMBOL] ?? distributedRateLimitStore;
}

async function distributedRateLimitStore(input: {
  bucketKey: string;
  windowMs: number;
}) {
  const sql = createSqlClient();

  try {
    return await claimApiRateLimit(sql, input);
  } finally {
    await closeSqlClient(sql);
  }
}

function requireOwnerBoundary() {
  const owner = getSingleUserOwner();

  return owner.ok ? null : owner.response;
}

export function containsLikelySecret(value: string) {
  const secretPatterns = [
    /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[a-z0-9._-]{12,}/i,
    /(?:ghp_|github_pat_)[a-z0-9_]{20,}/i,
    /sk-[a-z0-9]{20,}/i,
    /postgres(?:ql)?:\/\/\S+/i,
  ];

  return secretPatterns.some((pattern) => pattern.test(value));
}

export function containsLikelySecretInJson(value: unknown): boolean {
  if (typeof value === "string") {
    return containsLikelySecret(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsLikelySecretInJson(item));
  }

  if (isJsonObject(value)) {
    return Object.entries(value).some(([key, entry]) => (
      containsLikelySecret(key) || containsLikelySecretInJson(entry)
    ));
  }

  return false;
}

export function publicErrorMessage(message: string) {
  return message;
}

export function sanitizeOperationalError(error: unknown, code: string) {
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = truncate(raw.replace(/\s+/g, " "), 240);

  if (containsLikelySecret(trimmed)) {
    return `${code}: redacted internal error`;
  }

  return `${code}: ${trimmed}`;
}

export function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

async function readLimitedBody(
  request: Request,
  maxBytes: number,
): Promise<ReadRawBodyResult> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const parsed = Number(contentLength);

    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      return {
        ok: false,
        response: jsonError(400, "invalid_content_length", "Content-Length must be a non-negative integer."),
      };
    }

    if (parsed > maxBytes) {
      return {
        ok: false,
        response: payloadTooLarge(maxBytes),
      };
    }
  }

  if (request.body === null) {
    return { ok: true, buffer: Buffer.alloc(0), text: "" };
  }

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);

      return {
        ok: false,
        response: payloadTooLarge(maxBytes),
      };
    }

    chunks.push(Buffer.from(value));
  }

  const buffer = Buffer.concat(chunks, total);

  return {
    ok: true,
    buffer,
    text: buffer.toString("utf8"),
  };
}

function payloadTooLarge(maxBytes: number) {
  return jsonError(413, "request_too_large", "Request body is too large.", {
    maxBytes,
  });
}

function requireBearerSecret(
  request: Request,
  candidates: Array<{
    envName: string;
    label: string;
  }>,
) {
  const configured = candidates
    .map((candidate) => ({
      ...candidate,
      value: getEnvValue(candidate.envName),
    }))
    .filter((candidate): candidate is {
      envName: string;
      label: string;
      value: string;
    } => candidate.value !== undefined);

  if (configured.length === 0) {
    return jsonError(503, "missing_env", `${candidates.map((candidate) => candidate.envName).join(" or ")} is not configured.`, {
      env: candidates.map((candidate) => candidate.envName).join(","),
    });
  }

  const token = getBearerToken(request);

  if (token === undefined) {
    return jsonError(401, "missing_authorization", `Bearer ${configured[0]?.label ?? "token"} is required.`);
  }

  if (!configured.some((candidate) => safeCompareUtf8(token, candidate.value))) {
    return jsonError(401, "invalid_authorization", `Bearer ${configured[0]?.label ?? "token"} is invalid.`);
  }

  return null;
}

export function getEnvValue(name: string) {
  const runtimeEnv: Record<string, string | undefined> = process.env;
  const value = runtimeEnv[name]?.trim();

  if (value === "" || value === undefined) {
    return undefined;
  }

  // Treat shipped placeholder values as unconfigured so a copied .env.example
  // can never authenticate. Fail closed with missing_env instead.
  if (isPlaceholderSecret(value)) {
    return undefined;
  }

  return value;
}

function getBearerToken(request: Request) {
  const value = request.headers.get("authorization");

  if (value === null) {
    return undefined;
  }

  const [scheme, token] = value.split(/\s+/, 2);

  if (scheme !== "Bearer" || token === undefined || token.trim().length === 0) {
    return undefined;
  }

  return token.trim();
}

function clientIdentity(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization) {
    return `auth:${createHash("sha256").update(authorization).digest("hex").slice(0, 24)}`;
  }

  if (process.env.DEVRANK_TRUST_PROXY_IP_HEADERS !== "true") {
    return "anonymous";
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (forwardedFor) {
    return hashedClientIdentity("ip", forwardedFor);
  }

  const realIp = request.headers.get("x-real-ip")?.trim();

  if (realIp) {
    return hashedClientIdentity("ip", realIp);
  }

  return "anonymous";
}

function hashedClientIdentity(type: string, value: string) {
  return `${type}:${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function normalizeHexSignature(
  signatureHeader: string,
  expectedPrefix: string | undefined,
) {
  let signature = signatureHeader.trim();

  if (expectedPrefix !== undefined) {
    if (!signature.startsWith(expectedPrefix)) {
      return undefined;
    }

    signature = signature.slice(expectedPrefix.length);
  }

  const normalized = signature.toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function safeCompareHex(expectedHex: string, receivedHex: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");

  return expected.length === received.length && timingSafeEqual(expected, received);
}

function safeCompareUtf8(expectedText: string, receivedText: string) {
  const expected = Buffer.from(expectedText, "utf8");
  const received = Buffer.from(receivedText, "utf8");

  return expected.length === received.length && timingSafeEqual(expected, received);
}
