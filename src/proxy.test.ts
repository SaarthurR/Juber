import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import {
  getProxyDecision,
  handleProxyRequest,
} from "./proxy";
import { DESKTOP_COOKIE } from "./lib/route-targets";

const ORIGIN = "https://juber.invalid";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const UUID = "123e4567-e89b-42d3-a456-426614174000";

function request(
  path: string,
  {
    method = "GET",
    ua = MOBILE_UA,
    cookie,
  }: {
    method?: string;
    ua?: string;
    cookie?: string;
  } = {},
) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      "user-agent": ua,
      ...(cookie ? { cookie } : {}),
    },
  });
}

function refreshedResponse() {
  const response = NextResponse.next();
  response.headers.append("set-cookie", "sb-a=1; Path=/; HttpOnly");
  response.headers.append("set-cookie", "sb-b=; Path=/; Max-Age=0");
  response.headers.set("x-session-internal", "must-not-leak");
  return response;
}

function setCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.();
  if (values?.length) return values;
  return headers.get("set-cookie")?.split(/, (?=[^;,]+=)/) ?? [];
}

test("mobile proxy decision covers exact and deep aliases", () => {
  const mappings = [
    ["/", "/m"],
    ["/rides", "/m"],
    ["/rides/new", "/m/rides/new"],
    [`/rides/${UUID}`, `/m/rides/${UUID}`],
    ["/requests", "/m/requests"],
    ["/requests/new", "/m/requests/new"],
    [`/requests/${UUID}`, `/m/requests/${UUID}`],
    ["/messages", "/m/messages"],
    [`/messages/${UUID}`, `/m/messages/${UUID}`],
    ["/events", "/m/events"],
    ["/events/paryushan-2026", "/m/events/paryushan-2026"],
    ["/profile", "/m/profile"],
    [`/profile/${UUID}`, `/m/profile/${UUID}`],
  ];

  for (const [from, to] of mappings) {
    const decision = getProxyDecision(request(`${from}?from=push`));
    assert.equal(decision.kind, "redirect", from);
    assert.equal(decision.url.pathname, to);
    assert.equal(decision.url.search, "?from=push");
  }
});

test("mobile proxy decision rejects invalid and excluded aliases", () => {
  const passThrough = [
    "/rides/not-a-uuid",
    `/rides/${UUID}/extra`,
    "/requests/not-a-uuid",
    "/messages/abc",
    "/events/bad_slug",
    "/events/Admin",
    "/events/paryushan-2026/extra",
    "/profile/me",
    `/m/rides/${UUID}`,
    "/auth/callback",
    "/admin",
    "/terms",
    "/privacy",
    "/_next/data/build-id/rides.json",
  ];

  for (const path of passThrough) {
    assert.equal(getProxyDecision(request(path)).kind, "next", path);
  }
});

test("desktop UA and desktop opt-out pass through", () => {
  assert.equal(getProxyDecision(request("/rides", { ua: DESKTOP_UA })).kind, "next");
  assert.equal(
    getProxyDecision(
      request("/rides", { cookie: `${DESKTOP_COOKIE}=1` }),
    ).kind,
    "next",
  );
});

test("proxy redirects only safe navigation methods", () => {
  assert.equal(getProxyDecision(request("/rides", { method: "GET" })).kind, "redirect");
  assert.equal(getProxyDecision(request("/rides", { method: "HEAD" })).kind, "redirect");

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(getProxyDecision(request("/rides", { method })).kind, "next", method);
  }
});

test("desktop query opt-out activates only for exactly one desktop=1 value", () => {
  const decision = getProxyDecision(request("/rides/new?desktop=1&event_id=abc"));

  assert.equal(decision.kind, "redirect");
  assert.equal(decision.setDesktopCookie, true);
  assert.equal(decision.url.pathname, "/rides/new");
  assert.equal(decision.url.search, "?event_id=abc");
});

test("desktop query opt-out ignores falsey empty arbitrary and duplicate values", () => {
  const cases = [
    ["/rides?desktop=0&x=1", "/m", "?desktop=0&x=1"],
    ["/rides?desktop=&x=1", "/m", "?desktop=&x=1"],
    ["/rides?desktop=yes&x=1", "/m", "?desktop=yes&x=1"],
    ["/rides?desktop=1&desktop=1&x=1", "/m", "?desktop=1&desktop=1&x=1"],
    ["/rides?desktop=1&desktop=0&x=1", "/m", "?desktop=1&desktop=0&x=1"],
  ] as const;

  for (const [path, pathname, search] of cases) {
    const decision = getProxyDecision(request(path));
    assert.equal(decision.kind, "redirect", path);
    assert.equal(decision.setDesktopCookie, undefined, path);
    assert.equal(decision.url.pathname, pathname, path);
    assert.equal(decision.url.search, search, path);
  }
});

test("proxy refreshes session before redirect and copies only set-cookie headers", async () => {
  const calls: string[] = [];
  const response = await handleProxyRequest(
    request(`/rides/${UUID}?invite=1`),
    async (sessionRequest) => {
      calls.push(sessionRequest.nextUrl.pathname);
      return refreshedResponse();
    },
  );

  assert.deepEqual(calls, [`/rides/${UUID}`]);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `${ORIGIN}/m/rides/${UUID}?invite=1`);
  assert.deepEqual(setCookies(response), [
    "sb-a=1; Path=/; HttpOnly",
    "sb-b=; Path=/; Max-Age=0",
  ]);
  assert.equal(response.headers.get("x-session-internal"), null);
});

test("proxy refreshes session before opt-out redirect and keeps the desktop cookie", async () => {
  const response = await handleProxyRequest(
    request("/events/paryushan-2026?desktop=1&ref=mail"),
    async () => refreshedResponse(),
  );
  const cookies = setCookies(response);

  assert.equal(response.headers.get("location"), `${ORIGIN}/events/paryushan-2026?ref=mail`);
  assert.ok(cookies.includes("sb-a=1; Path=/; HttpOnly"));
  assert.ok(cookies.includes("sb-b=; Path=/; Max-Age=0"));
  assert.ok(cookies.some((cookie) => cookie.startsWith(`${DESKTOP_COOKIE}=1;`)));
  assert.equal(response.headers.get("x-session-internal"), null);
});

test("proxy does not set desktop cookie for non-exact desktop query values", async () => {
  const response = await handleProxyRequest(
    request("/rides?desktop=0&ref=mail"),
    async () => refreshedResponse(),
  );
  const cookies = setCookies(response);

  assert.equal(response.headers.get("location"), `${ORIGIN}/m?desktop=0&ref=mail`);
  assert.ok(cookies.includes("sb-a=1; Path=/; HttpOnly"));
  assert.ok(cookies.includes("sb-b=; Path=/; Max-Age=0"));
  assert.ok(cookies.every((cookie) => !cookie.startsWith(`${DESKTOP_COOKIE}=`)));
});

test("proxy refreshes session before pass-through branches", async () => {
  const response = await handleProxyRequest(
    request("/rides", { ua: DESKTOP_UA }),
    async () => refreshedResponse(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(setCookies(response), [
    "sb-a=1; Path=/; HttpOnly",
    "sb-b=; Path=/; Max-Age=0",
  ]);
  assert.equal(response.headers.get("x-session-internal"), "must-not-leak");
});
