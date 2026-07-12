import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { DESKTOP_COOKIE } from "@/lib/route-targets";

type ProxyDecision =
  | { kind: "next" }
  | { kind: "redirect"; url: URL; setDesktopCookie?: boolean };

type SessionRefresher = (request: NextRequest) => Promise<NextResponse>;

// Phones get the /m mobile system. Aliases stay closed to actual mobile pages.
const MOBILE_ROUTE: Record<string, string> = {
  "/": "/m",
  "/rides": "/m",
  "/rides/new": "/m/rides/new",
  "/requests": "/m/requests",
  "/requests/new": "/m/requests/new",
  "/profile": "/m/profile",
  "/events": "/m/events",
  "/messages": "/m/messages",
};

const MOBILE_UA = /Mobi|Android|iPhone|iPod|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i;
const SAFE_NAVIGATION_METHODS = new Set(["GET", "HEAD"]);
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function getProxyDecision(request: NextRequest): ProxyDecision {
  const { pathname, searchParams } = request.nextUrl;
  const originalPathname = new URL(request.url).pathname;

  if (!SAFE_NAVIGATION_METHODS.has(request.method)) return { kind: "next" };
  if (isExcludedPath(originalPathname)) return { kind: "next" };

  if (isDesktopOptOut(searchParams)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("desktop");
    return { kind: "redirect", url, setDesktopCookie: true };
  }

  const optedOut = request.cookies.get(DESKTOP_COOKIE)?.value === "1";
  const isMobile = MOBILE_UA.test(request.headers.get("user-agent") ?? "");
  const preserveDesktopProfileFlow =
    pathname === "/profile"
    && searchParams.has("next")
    && (searchParams.get("onboarding") === "1"
      || searchParams.get("contact_required") === "1");

  if (!isMobile || optedOut || preserveDesktopProfileFlow || isExcludedPath(pathname)) {
    return { kind: "next" };
  }

  const target = mobileTargetPath(pathname);
  if (!target) return { kind: "next" };

  const url = request.nextUrl.clone();
  url.pathname = target;
  return { kind: "redirect", url };
}

export async function handleProxyRequest(
  request: NextRequest,
  refreshSession: SessionRefresher = updateSession,
) {
  const refreshedResponse = await refreshSession(request);
  const decision = getProxyDecision(request);

  if (decision.kind === "next") return refreshedResponse;

  const response = NextResponse.redirect(decision.url);

  if (decision.setDesktopCookie) {
    response.cookies.set(DESKTOP_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  copySetCookieHeaders(refreshedResponse, response);

  return response;
}

// Next.js 16 "proxy" convention (formerly middleware).
export async function proxy(request: NextRequest) {
  return handleProxyRequest(request);
}

function mobileTargetPath(pathname: string) {
  const exact = MOBILE_ROUTE[pathname];
  if (exact) return exact;

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;

  const [root, segment] = parts;
  if (root === "rides" && UUID_SEGMENT.test(segment)) return `/m/rides/${segment}`;
  if (root === "requests" && UUID_SEGMENT.test(segment)) return `/m/requests/${segment}`;
  if (root === "messages" && UUID_SEGMENT.test(segment)) return `/m/messages/${segment}`;
  if (root === "events" && EVENT_SLUG_SEGMENT.test(segment)) return `/m/events/${segment}`;
  if (root === "profile" && UUID_SEGMENT.test(segment)) return `/m/profile/${segment}`;

  return null;
}

function isDesktopOptOut(searchParams: URLSearchParams) {
  const desktopValues = searchParams.getAll("desktop");
  return desktopValues.length === 1 && desktopValues[0] === "1";
}

function isExcludedPath(pathname: string) {
  return pathname === "/m"
    || pathname.startsWith("/m/")
    || pathname === "/auth"
    || pathname.startsWith("/auth/")
    || pathname === "/admin"
    || pathname.startsWith("/admin/")
    || pathname === "/terms"
    || pathname.startsWith("/terms/")
    || pathname === "/privacy"
    || pathname.startsWith("/privacy/")
    || pathname.startsWith("/_next/")
    || pathname.startsWith("/api/");
}

function copySetCookieHeaders(from: Response, to: Response) {
  for (const cookie of getSetCookieHeaders(from.headers)) {
    to.headers.append("set-cookie", cookie);
  }
}

function getSetCookieHeaders(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = getSetCookie?.call(headers);
  if (values?.length) return values;

  const header = headers.get("set-cookie");
  return header ? header.split(/, (?=[^;,]+=)/) : [];
}

export const config = {
  matcher: [
    // Run on everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
