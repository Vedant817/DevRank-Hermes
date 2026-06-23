import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_DASHBOARD_USER = "devrank";

export function proxy(request: NextRequest) {
  const expectedToken = process.env.DEVRANK_DASHBOARD_TOKEN?.trim()
    || process.env.DEVRANK_API_TOKEN?.trim();

  if (!expectedToken) {
    return new NextResponse("Dashboard auth is not configured.", {
      status: 503,
    });
  }

  const expectedUser = process.env.DEVRANK_DASHBOARD_USER?.trim()
    || DEFAULT_DASHBOARD_USER;
  const authorization = request.headers.get("authorization");

  if (isAuthorized(authorization, expectedUser, expectedToken)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="DevRank OS", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: "/",
};

function isAuthorized(
  authorization: string | null,
  expectedUser: string,
  expectedToken: string,
) {
  if (authorization === null) {
    return false;
  }

  const [scheme, credentials] = authorization.split(/\s+/, 2);

  if (scheme === "Bearer" && credentials !== undefined) {
    return constantTimeEqual(credentials.trim(), expectedToken);
  }

  if (scheme !== "Basic" || credentials === undefined) {
    return false;
  }

  const decoded = decodeBasicCredentials(credentials);

  if (decoded === undefined) {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex < 0) {
    return false;
  }

  const user = decoded.slice(0, separatorIndex);
  const token = decoded.slice(separatorIndex + 1);

  return constantTimeEqual(user, expectedUser)
    && constantTimeEqual(token, expectedToken);
}

function decodeBasicCredentials(credentials: string) {
  try {
    return atob(credentials);
  } catch {
    return undefined;
  }
}

function constantTimeEqual(received: string, expected: string) {
  const length = Math.max(received.length, expected.length);
  let mismatch = received.length ^ expected.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return mismatch === 0;
}
