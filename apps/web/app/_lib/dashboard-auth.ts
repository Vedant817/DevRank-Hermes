import { isPlaceholderSecret, resolveSingleUserOwner } from "@repo/shared";
import { cookies } from "next/headers";

export async function isDashboardActionAuthorized(): Promise<boolean> {
  return (await getDashboardActionOwner()) !== undefined;
}

export async function getDashboardActionOwner(): Promise<string | undefined> {
  let ownerId: string;

  try {
    ownerId = resolveSingleUserOwner().id;
  } catch {
    return undefined;
  }

  const rawToken = process.env.DEVRANK_DASHBOARD_TOKEN?.trim()
    || process.env.DEVRANK_API_TOKEN?.trim();

  if (!rawToken || isPlaceholderSecret(rawToken)) {
    return undefined;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("dashboard-token")?.value;

  return token !== undefined && constantTimeEqual(token, rawToken) ? ownerId : undefined;
}

function constantTimeEqual(received: string, expected: string) {
  const length = Math.max(received.length, expected.length);
  let mismatch = received.length ^ expected.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return mismatch === 0;
}
