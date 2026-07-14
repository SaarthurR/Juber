import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState, DEMO_IDS } from "./fixtures";
import { demoIdentity, localDemoUnlockEnabled, requireAdminOwner, resolveIdentity, validPresenterPasscode } from "./access";
import type { DemoSession } from "./types";

function session(): DemoSession {
  const state = createDemoState("2026-07-13");
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerKind: "admin",
    ownerId: DEMO_IDS.profiles.admin,
    activeActorId: state.activeActorId,
    seedDay: state.seedDay,
    revision: 0,
    state,
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

test("only a matching live administrator can own a new demo session", () => {
  const runtime = session();
  const admin = runtime.state.profiles[DEMO_IDS.profiles.admin];
  const member = runtime.state.profiles[DEMO_IDS.profiles.rider];
  assert.deepEqual(requireAdminOwner({ id: admin.id, email: null }, admin), { ownerKind: "admin", ownerId: admin.id });
  assert.throws(() => requireAdminOwner(null, null), /Administrator access required/);
  assert.throws(() => requireAdminOwner({ id: member.id, email: null }, member), /Administrator access required/);
  assert.throws(() => requireAdminOwner({ id: member.id, email: null }, admin), /Administrator access required/);
});

test("local presenter unlock requires an exact long passcode", () => {
  const passcode = "test-presenter-passcode-with-32-characters";
  assert.equal(validPresenterPasscode(passcode, passcode), true);
  assert.equal(validPresenterPasscode(`${passcode}x`, passcode), false);
  assert.equal(validPresenterPasscode("short", "short"), false);
  assert.equal(validPresenterPasscode(passcode, undefined), false);
  assert.equal(localDemoUnlockEnabled(passcode, ".juber/demo.sqlite"), true);
  assert.equal(localDemoUnlockEnabled(passcode, undefined), false);
  assert.equal(localDemoUnlockEnabled("short", ".juber/demo.sqlite"), false);
});

test("a demo identity never invokes the live data loader", async () => {
  const runtime = session();
  let liveCalls = 0;
  const identity = await resolveIdentity(runtime, async () => {
    liveCalls += 1;
    return { user: null, profile: null };
  });
  assert.deepEqual(identity, demoIdentity(runtime));
  assert.equal(liveCalls, 0);

  await resolveIdentity(null, async () => {
    liveCalls += 1;
    return { user: null, profile: null };
  });
  assert.equal(liveCalls, 1);
});
