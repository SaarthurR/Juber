import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

test("mobile event detail route exists inside the /m shell", () => {
  const page = fileURLToPath(new URL("app/m/events/[slug]/page.tsx", root));

  assert.equal(existsSync(page), true);
});

test("proxy maps mobile event detail without looping or overriding desktop opt-out", () => {
  const proxy = readFileSync(fileURLToPath(new URL("proxy.ts", root)), "utf8");

  assert.match(proxy, /pathname\.startsWith\("\/events\/"\)/);
  assert.match(proxy, /url\.pathname = `\/m\/events\/\$\{[^}]+}`/);
  assert.match(proxy, /!optedOut/);
});

test("landing browse links are marked anonymous-safe", () => {
  const home = readFileSync(fileURLToPath(new URL("app/(desktop)/page.tsx", root)), "utf8");

  assert.match(home, /href="\/rides"[\s\S]*data-auth-allowed="true"/);
  assert.match(home, /SectionHeader title="Upcoming events" href="\/events" allowAnonymousBrowse/);
  assert.match(home, /SectionHeader title="Scheduled rides" href="\/rides" allowAnonymousBrowse/);
  assert.match(home, /<EventCard[\s\S]*allowAnonymousBrowse/);
});

test("anonymous mobile event detail opts its Back control into public browsing", () => {
  const page = readFileSync(
    fileURLToPath(new URL("app/m/events/[slug]/page.tsx", root)),
    "utf8",
  );

  assert.match(
    page,
    /<SubHeader title="Ride board" backFallback="\/m\/events" allowAnonymousBack \/>/,
  );
});

test("mobile event post and request actions remain auth-gated", () => {
  const page = readFileSync(
    fileURLToPath(new URL("app/m/events/[slug]/page.tsx", root)),
    "utf8",
  );
  const actionLinks = page.slice(
    page.indexOf("const actionLinks"),
    page.indexOf("return (", page.indexOf("const actionLinks")),
  );

  assert.match(actionLinks, /href=\{`\/m\/rides\/new\?event_id=/);
  assert.match(actionLinks, /href=\{`\/m\/requests\/new\?event_id=/);
  assert.doesNotMatch(actionLinks, /data-auth-allowed/);
  assert.match(
    page,
    /\{user \? actionLinks : <LandingAuthGate>\{actionLinks\}<\/LandingAuthGate>\}/,
  );
});
