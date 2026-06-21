import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

type JsonObject = Record<string, unknown>;

type ReadJsonResult =
  | { ok: true; value: JsonObject }
  | { ok: false; response: NextResponse };

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

export async function readJsonObject(request: Request): Promise<ReadJsonResult> {
  let payload: unknown;

  try {
    payload = await request.json();
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

export function requireApiAuth(request: Request) {
  return requireBearerSecret(request, "DEVRANK_API_TOKEN", "API token");
}

export function requireCronAuth(request: Request) {
  return requireBearerSecret(request, "CRON_SECRET", "cron secret");
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

export async function readRawBody(request: Request) {
  const buffer = Buffer.from(await request.arrayBuffer());

  return {
    buffer,
    text: buffer.toString("utf8"),
  };
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

export function containsLikelySecret(value: string) {
  const secretPatterns = [
    /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[a-z0-9._-]{12,}/i,
    /(?:ghp_|github_pat_)[a-z0-9_]{20,}/i,
    /sk-[a-z0-9]{20,}/i,
    /postgres(?:ql)?:\/\/\S+/i,
  ];

  return secretPatterns.some((pattern) => pattern.test(value));
}

export function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function requireBearerSecret(
  request: Request,
  envName: string,
  label: string,
) {
  const expected = getEnvValue(envName);

  if (expected === undefined) {
    return jsonError(503, "missing_env", `${envName} is not configured.`, {
      env: envName,
    });
  }

  const token = getBearerToken(request);

  if (token === undefined) {
    return jsonError(401, "missing_authorization", `Bearer ${label} is required.`);
  }

  if (!safeCompareUtf8(token, expected)) {
    return jsonError(401, "invalid_authorization", `Bearer ${label} is invalid.`);
  }

  return null;
}

function getEnvValue(name: string) {
  const runtimeEnv: Record<string, string | undefined> = process.env;
  const value = runtimeEnv[name]?.trim();

  return value === "" ? undefined : value;
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
