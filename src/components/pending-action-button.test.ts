import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getPendingActionButtonView,
  pendingActionReducer,
} from "./pending-action-button";

const adminPage = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const profilePage = readFileSync(new URL("../app/profile/[id]/page.tsx", import.meta.url), "utf8");
const editProfilePage = readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
const contactModal = readFileSync(new URL("./contact-modal.tsx", import.meta.url), "utf8");
const contactSheet = readFileSync(new URL("./mobile/contact-sheet.tsx", import.meta.url), "utf8");

test("pendingActionReducer locks on the first submitted key", () => {
  const state = pendingActionReducer({ pendingKey: null }, { type: "start", key: "confirm" });

  assert.deepEqual(state, { pendingKey: "confirm" });
});

test("pendingActionReducer ignores competing starts while locked", () => {
  const state = pendingActionReducer({ pendingKey: "confirm" }, { type: "start", key: "decline" });

  assert.deepEqual(state, { pendingKey: "confirm" });
});

test("pendingActionReducer releases only the active key", () => {
  const stillLocked = pendingActionReducer(
    { pendingKey: "confirm" },
    { type: "finish", key: "decline" },
  );
  const released = pendingActionReducer(
    { pendingKey: "confirm" },
    { type: "finish", key: "confirm" },
  );

  assert.deepEqual(stillLocked, { pendingKey: "confirm" });
  assert.deepEqual(released, { pendingKey: null });
});

test("PendingActionButton view disables only while its form is pending or group is locked", () => {
  assert.deepEqual(
    getPendingActionButtonView({
      actionKey: "approve-1",
      children: "Approve",
      pending: false,
      pendingKey: null,
      pendingLabel: "Approving...",
    }),
    { disabled: false, label: "Approve", lockedByOther: false },
  );

  assert.deepEqual(
    getPendingActionButtonView({
      actionKey: "approve-1",
      children: "Approve",
      pending: true,
      pendingKey: "approve-1",
      pendingLabel: "Approving...",
    }),
    { disabled: true, label: "Approving...", lockedByOther: false },
  );

  assert.deepEqual(
    getPendingActionButtonView({
      actionKey: "reject-1",
      children: "Reject",
      pending: false,
      pendingKey: "approve-1",
      pendingLabel: "Rejecting...",
    }),
    { disabled: true, label: "Reject", lockedByOther: true },
  );
});

test("PendingActionButton view restores controls after an errored server action settles", () => {
  const locked = getPendingActionButtonView({
    actionKey: "profile-signout",
    children: "Sign out",
    pending: true,
    pendingKey: "profile-signout",
    pendingLabel: "Signing out...",
  });
  const restored = getPendingActionButtonView({
    actionKey: "profile-signout",
    children: "Sign out",
    pending: false,
    pendingKey: null,
    pendingLabel: "Signing out...",
  });

  assert.equal(locked.disabled, true);
  assert.equal(locked.label, "Signing out...");
  assert.deepEqual(restored, { disabled: false, label: "Sign out", lockedByOther: false });
});

test("admin mutation forms use PendingActionButton with action-specific pending labels", () => {
  assert.match(adminPage, /PendingActionGroup/);
  for (const label of [
    "Importing...",
    "Approving...",
    "Rejecting...",
    "Deleting...",
    "Adding event...",
    "Adding location...",
  ]) {
    assert.match(adminPage, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("profile, contact, and signout forms use PendingActionButton", () => {
  assert.match(profilePage, /PendingActionButton/);
  assert.match(profilePage, /Opening chat\.\.\./);
  assert.match(editProfilePage, /PendingActionButton/);
  assert.match(editProfilePage, /Signing out\.\.\./);
  assert.match(contactModal, /PendingActionButton/);
  assert.match(contactModal, /Opening chat\.\.\./);
  assert.match(contactSheet, /PendingActionButton/);
  assert.match(contactSheet, /Opening chat\.\.\./);
});
