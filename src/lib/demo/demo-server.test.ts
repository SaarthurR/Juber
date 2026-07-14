import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("server modules are guarded and excluded from the universal barrel", () => {
  assert.match(readFileSync(new URL("./session.ts", import.meta.url), "utf8"), /^import "server-only";/);
  assert.match(readFileSync(new URL("./store.ts", import.meta.url), "utf8"), /^import "server-only";/);
  const barrel = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(barrel, /\.\/session|\.\/store|\.\/server/);
});

test("server-only SQLite and signed-cookie checks run under the React server condition", () => {
  const script = `
    import assert from "node:assert/strict";
    import { createDemoState } from "./src/lib/demo/fixtures.ts";
    import { createDemoSessionToken, readDemoSessionCookie, serializeDemoSessionCookie, verifyDemoSessionToken } from "./src/lib/demo/session.ts";
    import { SqliteDemoSessionStore } from "./src/lib/demo/store.ts";
    import { DemoRevisionError } from "./src/lib/demo/types.ts";
    const seedDay = "2026-07-13";
    const store = new SqliteDemoSessionStore(":memory:");
    const first = await store.create({ ownerKind: "local", ownerId: "presenter", seedDay });
    const changed = await store.mutate(first.id, 0, { type: "set_scenario", scenario: "empty" });
    assert.equal(changed.revision, 1);
    await assert.rejects(() => store.mutate(first.id, 0, { type: "set_scenario", scenario: "read_error" }), error => error instanceof DemoRevisionError && error.actualRevision === 1);
    const reset = await store.reset(first.id, 1);
    assert.deepEqual(reset.state, createDemoState(seedDay));
    await store.delete(first.id);
    const second = await store.create({ ownerKind: "local", ownerId: "presenter", seedDay });
    assert.notEqual(second.id, first.id);
    assert.deepEqual(second.state, createDemoState(seedDay));
    store.close();
    const secret = "test-secret-with-at-least-thirty-two-characters";
    const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const token = createDemoSessionToken(sessionId, secret);
    const cookie = serializeDemoSessionCookie(token, { secure: true, maxAgeSeconds: 60 });
    assert.equal(verifyDemoSessionToken(token, secret), sessionId);
    assert.equal(readDemoSessionCookie(cookie, secret), sessionId);
    assert.equal(verifyDemoSessionToken(token + "x", secret), null);
    assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=60; Secure$/);
  `;
  const result = spawnSync(process.execPath, ["--import", "./scripts/test-server-only.mjs", "--import", "tsx", "--input-type=module", "-e", script], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
