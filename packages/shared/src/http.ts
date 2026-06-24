export type JsonResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export const DEFAULT_EXTERNAL_HTTP_TIMEOUT_MS = 10_000;
export const DEFAULT_EXTERNAL_HTTP_MAX_ATTEMPTS = 2;

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface FetchPolicyOptions {
  fetch?: typeof fetch;
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  retry?: boolean;
  sleep?: (delayMs: number) => Promise<void>;
  timeoutMs?: number;
}

export async function fetchWithPolicy(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchPolicyOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetch ?? fetch;
  const method = (init.method ?? "GET").toUpperCase();
  const retryEnabled = options.retry ?? SAFE_HTTP_METHODS.has(method);
  const maxAttempts = retryEnabled
    ? positiveInteger(options.maxAttempts, DEFAULT_EXTERNAL_HTTP_MAX_ATTEMPTS)
    : 1;
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_EXTERNAL_HTTP_TIMEOUT_MS);
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithDeadline(fetchImpl, input, init, timeoutMs);

      if (!shouldRetryResponse(response, attempt, maxAttempts)) {
        return response;
      }

      await response.body?.cancel().catch(() => undefined);
      await sleep(retryDelayMs(response, attempt, options.maxRetryDelayMs));
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || init.signal?.aborted) {
        throw error;
      }

      await sleep(retryDelayMs(undefined, attempt, options.maxRetryDelayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("External HTTP request failed.");
}

export async function parseJsonRequest<T>(
  request: Request,
  fallback: T,
): Promise<T> {
  const text = await request.text();

  if (text.trim().length === 0) {
    return fallback;
  }

  return JSON.parse(text) as T;
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, init);
}

export function jsonError(
  error: string,
  status = 400,
  details?: Record<string, unknown>,
): Response {
  return Response.json({ ok: false, error, details }, { status });
}

async function fetchWithDeadline(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`External HTTP request timed out after ${timeoutMs}ms.`));
  }, timeoutMs);
  const abortFromCaller = () => controller.abort(init.signal?.reason);

  if (init.signal?.aborted) {
    abortFromCaller();
  } else {
    init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function shouldRetryResponse(response: Response, attempt: number, maxAttempts: number) {
  return attempt < maxAttempts && RETRYABLE_HTTP_STATUSES.has(response.status);
}

function retryDelayMs(
  response: Response | undefined,
  attempt: number,
  configuredMaxDelay: number | undefined,
) {
  const maxDelay = positiveInteger(configuredMaxDelay, 2_000);
  const retryAfter = response ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
  const exponentialDelay = 250 * (2 ** (attempt - 1));

  return Math.min(retryAfter ?? exponentialDelay, maxDelay);
}

function parseRetryAfter(value: string | null) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = Date.parse(value);

  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
