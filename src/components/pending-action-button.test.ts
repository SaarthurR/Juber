import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getPendingActionButtonView,
  getPendingActionTransition,
  PendingActionButtonPresentation,
  pendingActionReducer,
} from "./pending-action-button";

const adminPage = readFileSync(new URL("../app/(desktop)/admin/page.tsx", import.meta.url), "utf8");
const profilePage = readFileSync(new URL("../app/(desktop)/profile/[id]/page.tsx", import.meta.url), "utf8");
const editProfilePage = readFileSync(new URL("../app/(desktop)/profile/page.tsx", import.meta.url), "utf8");
const contactModal = readFileSync(new URL("./contact-modal.tsx", import.meta.url), "utf8");
const contactSheet = readFileSync(new URL("./mobile/contact-sheet.tsx", import.meta.url), "utf8");
const pendingButton = readFileSync(new URL("./pending-action-button.tsx", import.meta.url), "utf8");

test("pendingActionReducer locks on the first submitted key", () => {
  const state = pendingActionReducer({ pendingKey: null }, { type: "start", key: "confirm" });

  assert.deepEqual(state, { pendingKey: "confirm" });
});

test("pendingActionReducer ignores competing starts while locked", () => {
  const state = pendingActionReducer({ pendingKey: "confirm" }, { type: "start", key: "decline" });

  assert.deepEqual(state, { pendingKey: "confirm" });
});

test("unmount finish releases only the matching active key", () => {
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

test("pending action transitions follow native form pending edges only", () => {
  assert.equal(getPendingActionTransition(false, false), null);
  assert.equal(getPendingActionTransition(false, true), "start");
  assert.equal(getPendingActionTransition(true, true), null);
  assert.equal(getPendingActionTransition(true, false), "finish");
});

test("PendingActionButton never starts the group from click timing", () => {
  assert.match(pendingButton, /const \{ pending \} = useFormStatus\(\)/);
  assert.match(pendingButton, /const groupDispatch = group\?\.dispatch/);
  assert.match(pendingButton, /getPendingActionTransition\(sawPending\.current, pending\)/);
  assert.match(
    pendingButton,
    /groupDispatch\?\.\(\{ type: "finish", key: actionKey \}\)/,
  );
  assert.doesNotMatch(pendingButton, /setTimeout|decision\.start|form\?\.checkValidity/);
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
  const adminForms = readFileSync(new URL("./admin-forms.tsx", import.meta.url), "utf8");

  assert.match(adminForms, /PendingActionGroup/);
  for (const label of [
    "Importing...",
    "Approving...",
    "Rejecting...",
    "Deleting...",
    "Adding event...",
    "Adding location...",
  ]) {
    assert.match(adminForms, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(adminPage, /AdminJcncImportForm/);
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
