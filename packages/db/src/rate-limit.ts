import type { SqlClient } from "./client.js";

export interface ApiRateLimitClaim {
  count: number;
  resetAt: string;
}

export async function claimApiRateLimit(
  sql: SqlClient,
  input: {
    bucketKey: string;
    windowMs: number;
  },
): Promise<ApiRateLimitClaim> {
  if (!Number.isInteger(input.windowMs) || input.windowMs <= 0) {
    throw new Error("Rate limit windowMs must be a positive integer.");
  }

  const rows = await sql<Array<{
    request_count: number;
    reset_at: Date | string;
  }>>`
    with cleanup as (
      delete from api_rate_limit_buckets
      where reset_at < now() - interval '1 day'
    )
    insert into api_rate_limit_buckets (
      bucket_key,
      request_count,
      reset_at,
      updated_at
    )
    values (
      ${input.bucketKey},
      1,
      now() + (${input.windowMs} * interval '1 millisecond'),
      now()
    )
    on conflict (bucket_key) do update set
      request_count = case
        when api_rate_limit_buckets.reset_at <= now() then 1
        else api_rate_limit_buckets.request_count + 1
      end,
      reset_at = case
        when api_rate_limit_buckets.reset_at <= now()
          then now() + (${input.windowMs} * interval '1 millisecond')
        else api_rate_limit_buckets.reset_at
      end,
      updated_at = now()
    returning request_count, reset_at
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Rate limit bucket claim returned no row.");
  }

  return {
    count: Number(row.request_count),
    resetAt: new Date(row.reset_at).toISOString(),
  };
}
