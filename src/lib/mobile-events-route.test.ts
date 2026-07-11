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
  const home = readFileSync(fileURLToPath(new URL("app/page.tsx", root)), "utf8");

  assert.match(home, /href="\/rides"[\s\S]*data-auth-allowed="true"/);
  assert.match(home, /SectionHeader title="Upcoming events" href="\/events" allowAnonymousBrowse/);
  assert.match(home, /<EventCard[\s\S]*allowAnonymousBrowse/);
});
