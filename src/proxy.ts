import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { DESKTOP_COOKIE } from "@/lib/route-targets";

// Phones get the /m mobile system. Ride/profile details stay shared; event
// details have a mobile-shell page so event browsing does not exit /m.
const MOBILE_ROUTE: Record<string, string> = {
  "/": "/m",
  "/rides": "/m",
  "/requests": "/m/requests",
  "/requests/new": "/m/requests/new",
  "/profile": "/m/profile",
  "/events": "/m/events",
  "/messages": "/m/messages",
};

const MOBILE_UA = /Mobi|Android|iPhone|iPod|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i;

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
  const preserveDesktopProfileFlow =
    pathname === "/profile"
    && searchParams.has("next")
    && (searchParams.get("onboarding") === "1"
      || searchParams.get("contact_required") === "1");
  const eventDetailSlug = pathname.startsWith("/events/")
    ? pathname.slice("/events/".length)
    : null;

  if (target && isMobile && !optedOut && !preserveDesktopProfileFlow) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  if (eventDetailSlug && isMobile && !optedOut) {
    const url = request.nextUrl.clone();
    url.pathname = `/m/events/${eventDetailSlug}`;
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
