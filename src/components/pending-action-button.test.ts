import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getPendingActionClickDecision,
  getPendingActionButtonView,
  PendingActionButtonPresentation,
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

test("pending action click starts only for an unblocked valid submission", () => {
  assert.deepEqual(
    getPendingActionClickDecision({
      defaultPrevented: false,
      formIsValid: true,
      lockedByOther: false,
    }),
    { preventDefault: false, start: true },
  );
});

test("custom default prevention does not start or strand the group lock", () => {
  assert.deepEqual(
    getPendingActionClickDecision({
      defaultPrevented: true,
      formIsValid: true,
      lockedByOther: false,
    }),
    { preventDefault: false, start: false },
  );
});

test("failed native validation does not start or strand the group lock", () => {
  assert.deepEqual(
    getPendingActionClickDecision({
      defaultPrevented: false,
      formIsValid: false,
      lockedByOther: false,
    }),
    { preventDefault: false, start: false },
  );
});

test("a competing group action suppresses submission without changing the active key", () => {
  const decision = getPendingActionClickDecision({
    defaultPrevented: false,
    formIsValid: true,
    lockedByOther: true,
  });
  const state = pendingActionReducer(
    { pendingKey: "approve" },
    decision.start ? { type: "start", key: "reject" } : { type: "finish", key: "reject" },
  );

  assert.deepEqual(decision, { preventDefault: true, start: false });
  assert.deepEqual(state, { pendingKey: "approve" });
});

test("a settled action releases the group so another action can start", () => {
  const released = pendingActionReducer(
    { pendingKey: "approve" },
    { type: "finish", key: "approve" },
  );
  const restarted = pendingActionReducer(released, { type: "start", key: "reject" });

  assert.deepEqual(restarted, { pendingKey: "reject" });
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

test("PendingActionButton presentation renders pending and restored views", () => {
  const pending = renderToStaticMarkup(
    createElement(PendingActionButtonPresentation, {
      view: getPendingActionButtonView({
        actionKey: "signout",
        children: "Sign out",
        pending: true,
        pendingKey: "signout",
        pendingLabel: "Signing out...",
      }),
      className: "action",
    }),
  );
  const restored = renderToStaticMarkup(
    createElement(PendingActionButtonPresentation, {
      view: getPendingActionButtonView({
        actionKey: "signout",
        children: "Sign out",
        pending: false,
        pendingKey: null,
        pendingLabel: "Signing out...",
      }),
      className: "action",
    }),
  );

  assert.match(pending, /disabled=""/);
  assert.match(pending, /Signing out\.\.\./);
  assert.doesNotMatch(restored, /disabled=""/);
  assert.match(restored, />Sign out<\/button>/);
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

test("profile and contact message forms use PendingActionButton", () => {
  assert.match(profilePage, /PendingActionButton/);
  assert.match(profilePage, /Opening chat\.\.\./);
  assert.match(contactModal, /PendingActionButton/);
  assert.match(contactModal, /Opening chat\.\.\./);
  assert.match(contactSheet, /PendingActionButton/);
  assert.match(contactSheet, /Opening chat\.\.\./);
});

test("desktop profile delegates sign-out to the React-managed form", () => {
  assert.match(editProfilePage, /<SignOutForm variant="desktop"/);
  assert.doesNotMatch(editProfilePage, /action="\/auth\/signout"/);
});
