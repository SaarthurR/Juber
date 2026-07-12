import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appRoot = new URL("../app/", import.meta.url);
const componentsRoot = new URL("../components/", import.meta.url);

function appPath(path: string) {
  return fileURLToPath(new URL(path, appRoot));
}

function componentPath(path: string) {
  return fileURLToPath(new URL(path, componentsRoot));
}

test("desktop route group owns desktop chrome while /m stays structurally outside it", () => {
  const rootLayout = readFileSync(appPath("layout.tsx"), "utf8");
  const desktopLayout = readFileSync(appPath("(desktop)/layout.tsx"), "utf8");
  const mobileLayout = readFileSync(appPath("m/layout.tsx"), "utf8");

  assert.doesNotMatch(rootLayout, /Navbar|SiteChrome|NotificationBell|MessagesNavLink|<footer/);
  assert.doesNotMatch(rootLayout, /ContactRequiredGate/);
  assert.match(rootLayout, /ModerationBannedGate/);
  assert.match(desktopLayout, /<Navbar user=\{user\} profile=\{profile\} \/>/);
  assert.match(desktopLayout, /<NotificationsProvider/);
  assert.match(desktopLayout, /<RouteProgress>[\s\S]*<\/RouteProgress>/);
  assert.match(desktopLayout, /<main className="flex-1">\{children\}<\/main>/);
  assert.doesNotMatch(desktopLayout, /key=\{pathname\}|SiteChrome|PageLoading/);
  assert.doesNotMatch(mobileLayout, /Navbar|NotificationsProvider|RouteProgress|SiteChrome/);
});

test("URL-preserving desktop routes moved into the (desktop) group", () => {
  const desktopPages = [
    "page.tsx",
    "rides/page.tsx",
    "rides/[id]/page.tsx",
    "rides/new/page.tsx",
    "requests/page.tsx",
    "requests/[id]/page.tsx",
    "requests/new/page.tsx",
    "events/page.tsx",
    "events/[slug]/page.tsx",
    "messages/page.tsx",
    "messages/[id]/page.tsx",
    "profile/page.tsx",
    "profile/[id]/page.tsx",
    "admin/page.tsx",
    "privacy/page.tsx",
    "terms/page.tsx",
  ];

  for (const page of desktopPages) {
    assert.equal(existsSync(appPath(`(desktop)/${page}`)), true, `${page} should live in (desktop)`);
    assert.equal(existsSync(appPath(page)), false, `${page} should not remain at app root`);
  }

  assert.equal(existsSync(appPath("m/page.tsx")), true);
  assert.equal(existsSync(appPath("auth/callback/route.ts")), true);
});

test("group-root loading boundaries exist without blocking global or detail loaders", () => {
  const groupLoaders = ["(desktop)/loading.tsx", "m/loading.tsx"];
  for (const loading of groupLoaders) {
    assert.equal(existsSync(appPath(loading)), true, `${loading} should exist`);
  }

  const deleted = [
    "loading.tsx",
    "events/[slug]/loading.tsx",
    "rides/[id]/loading.tsx",
    "requests/[id]/loading.tsx",
    "messages/[id]/loading.tsx",
    "profile/[id]/loading.tsx",
    "m/requests/loading.tsx",
    "m/requests/[id]/loading.tsx",
    "m/events/loading.tsx",
    "m/profile/loading.tsx",
    "m/messages/loading.tsx",
    "m/messages/[id]/loading.tsx",
    "m/rides/[id]/loading.tsx",
  ];

  for (const loading of deleted) {
    assert.equal(existsSync(appPath(loading)), false, `${loading} should be deleted`);
  }

  const desktopLoading = readFileSync(appPath("(desktop)/loading.tsx"), "utf8");
  const mobileLoading = readFileSync(appPath("m/loading.tsx"), "utf8");
  assert.match(desktopLoading, /PageSkeleton/);
  assert.match(mobileLoading, /PageSkeleton/);
  assert.equal(existsSync(componentPath("page-skeleton.tsx")), true);
  assert.equal(existsSync(componentPath("page-loading.tsx")), false);
  assert.equal(existsSync(componentPath("site-chrome.tsx")), false);
});

test("desktop notifications have one provider channel and gated surface refresh", () => {
  const provider = readFileSync(componentPath("notifications-provider.tsx"), "utf8");
  const bell = readFileSync(componentPath("notification-bell.tsx"), "utf8");
  const navLink = readFileSync(componentPath("messages-nav-link.tsx"), "utf8");
  const navbar = readFileSync(componentPath("navbar.tsx"), "utf8");
  const mobileSheet = readFileSync(componentPath("mobile/notifications-sheet.tsx"), "utf8");

  assert.match(provider, /subscribeToNotificationChanges\([\s\S]*"bell"/);
  assert.equal((provider.match(/return subscribeToNotificationChanges/g) ?? []).length, 1);
  assert.match(provider, /document\.visibilityState === "visible"/);
  assert.match(provider, /createNotificationRefreshGate/);
  assert.match(provider, /\.invalidate\(/);
  assert.match(provider, /notificationTriggersSurfaceRefresh/);
  assert.match(provider, /createSurfaceRefreshDebouncer/);
  const subscriptionStart = provider.indexOf("return subscribeToNotificationChanges");
  const subscriptionEnd = provider.indexOf(
    "}, [refreshGate, userId]);",
    subscriptionStart,
  );
  assert.ok(subscriptionStart >= 0);
  assert.ok(
    subscriptionEnd > subscriptionStart,
    "desktop channel effect must only reconnect when userId changes",
  );
  assert.doesNotMatch(bell, /subscribeToNotificationChanges|router\.refresh|useRouter|loadVisibleNotificationIds/);
  assert.match(bell, /useNotifications\(\)/);
  assert.match(navLink, /useNotifications\(\)/);
  assert.doesNotMatch(navLink, /initialUnread/);
  assert.match(navbar, /<NotificationBell \/>/);
  assert.match(mobileSheet, /subscribeToNotificationChanges\([\s\S]*"mobile-notifications"/);
});

test("session proxy behavior remains invariant and exposes no spoofable surface marker", () => {
  const proxy = readFileSync(fileURLToPath(new URL("../proxy.ts", import.meta.url)), "utf8");
  const middleware = readFileSync(
    fileURLToPath(new URL("../lib/supabase/middleware.ts", import.meta.url)),
    "utf8",
  );

  assert.match(proxy, /return handleProxyRequest\(request\)/);
  assert.match(proxy, /const refreshedResponse = await refreshSession\(request\)/);
  assert.match(proxy, /copySetCookieHeaders\(refreshedResponse, response\)/);
  assert.match(proxy, /pathname === "\/profile"/);
  assert.match(proxy, /root === "events"/);
  assert.match(proxy, /matcher: \[/);
  assert.doesNotMatch(proxy, /x-juber-surface|headers\(\)/);
  assert.match(middleware, /await supabase\.auth\.getSession\(\)/);
});
