export type JsonResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

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
