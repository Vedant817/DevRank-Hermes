import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_DASHBOARD_USER = "devrank";

export function proxy(request: NextRequest) {
  const ownerId = process.env.DEVRANK_OWNER_ID?.trim();

  if (!ownerId || !/^[a-zA-Z0-9_-]{1,64}$/.test(ownerId)) {
    return new NextResponse("Single-user owner is not configured.", {
      status: 503,
    });
  }

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
  const tokenCookie = request.cookies.get("dashboard-token")?.value;

  if (
    isAuthorized(authorization, expectedUser, expectedToken) ||
    (tokenCookie !== undefined && constantTimeEqual(tokenCookie, expectedToken))
  ) {
    const response = NextResponse.next();
    response.cookies.set("dashboard-token", expectedToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    return response;
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="DevRank OS", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/", "/dashboards/:path*"],
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
