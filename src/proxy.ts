import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth";

/*
 * Authoritative auth gate for `/admin`: unauthenticated requests are answered
 * with a real HTTP redirect to the login page before anything renders.
 *
 * The session is a self-contained signed cookie with no server-side store, so
 * verifying it here is complete, not merely optimistic: signature, expiry and
 * the configured username are all checked. This is where the redirect can still
 * set the response status — a `redirect()` thrown later, during the streamed
 * render of the panel layout, cannot, because the shell has already flushed.
 *
 * In Next 16 the `middleware` convention was renamed to `proxy`, and it runs on
 * the Node.js runtime by default, so `node:crypto` is available here.
 */

const LOGIN_PATH = "/admin/login";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The login page must stay reachable while unauthenticated.
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (verifyAdminSessionToken(token)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
