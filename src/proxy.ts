import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Phones get the /m mobile system. Only the top-level routes are mapped — detail
// pages (rides/[id], profile/[id], events/[slug]) stay on the shared desktop
// views that the mobile screens intentionally link to, which also avoids loops.
const MOBILE_ROUTE: Record<string, string> = {
  "/": "/m",
  "/rides": "/m",
  "/requests": "/m/requests",
  "/requests/new": "/m/requests/new",
  "/profile": "/m/profile",
  "/events": "/m/events",
};

const MOBILE_UA = /Mobi|Android|iPhone|iPod|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i;

// Escape hatch: ?desktop=1 sets a cookie that opts a phone out of the redirect.
const DESKTOP_COOKIE = "force-desktop";

// Next.js 16 "proxy" convention (formerly middleware).
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (searchParams.has("desktop")) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("desktop");
    const res = NextResponse.redirect(url);
    res.cookies.set(DESKTOP_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  const target = MOBILE_ROUTE[pathname];
  const optedOut = request.cookies.get(DESKTOP_COOKIE)?.value === "1";
  const isMobile = MOBILE_UA.test(request.headers.get("user-agent") ?? "");

  if (target && isMobile && !optedOut) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
