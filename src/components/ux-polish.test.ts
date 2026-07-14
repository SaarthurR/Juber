import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ADMIN_DECISION_OPTIONS } from "@/lib/admin-moderation";
import {
  getInitialFocusTarget,
  nextFocusableIndex,
  restoreFocus,
  shouldDismissLayer,
} from "@/lib/dialog-a11y";

test("message report is an accessible absolute context action without row bulk", () => {
  const messageThread = readFileSync("src/components/message-thread.tsx", "utf8");
  const reportButton = readFileSync("src/components/report-target-button.tsx", "utf8");

  assert.match(messageThread, /label="Report message"/);
  assert.match(messageThread, /compact/);
  assert.match(messageThread, /group relative flex max-w-\[75%\] flex-col/);
  assert.match(messageThread, /absolute left-full top-1\/2 ml-1 -translate-y-1\/2/);
  assert.match(messageThread, /opacity-70/);
  assert.match(messageThread, /group-hover:opacity-100/);
  assert.match(messageThread, /focus-within:opacity-100/);
  assert.match(messageThread, /\[@media\(hover:hover\)_and_\(pointer:fine\)\]:opacity-0/);
  assert.doesNotMatch(messageThread, /className="mt-1 self-start"/);

  assert.match(reportButton, /compact = false/);
  assert.match(reportButton, /aria-label=\{label\}/);
  assert.match(reportButton, /title=\{label\}/);
  assert.match(reportButton, /h-11 w-11/);
  assert.match(reportButton, /focus-visible:ring-2/);
  assert.match(reportButton, /\{!compact && label\}/);
});

test("open report layers escape transformed message actions", () => {
  const source = readFileSync("src/components/report-target-button.tsx", "utf8");

  assert.match(source, /import \{ createPortal \} from "react-dom"/);
  assert.equal(source.match(/if \(!open\) return null;\s*\n\s*return createPortal\(/g)?.length, 2);
  assert.equal(source.match(/document\.body,/g)?.length, 2);
});

test("ride report is de-emphasized without losing header access", () => {
  const desktopRide = readFileSync("src/app/(desktop)/rides/[id]/page.tsx", "utf8");
  const mobileRide = readFileSync("src/app/m/rides/[id]/page.tsx", "utf8");

  for (const source of [desktopRide, mobileRide]) {
    assert.match(source, /tone="subtle"/);
    assert.match(source, /label="Report ride"/);
    assert.match(source, /ReportTargetButton/);
  }
});

test("admin moderation decisions constrain enforcement by verdict", () => {
  assert.deepEqual(ADMIN_DECISION_OPTIONS.violation, [
    "none",
    "warn_reported",
    "temporary_ban",
    "permanent_ban",
  ]);
  assert.deepEqual(ADMIN_DECISION_OPTIONS.no_violation, ["none", "warn_reporter"]);
  assert.deepEqual(ADMIN_DECISION_OPTIONS.inconclusive, ["none"]);

  const decision = readFileSync("src/components/admin-moderation/decision-tools.tsx", "utf8");
  assert.match(decision, /Open evidence/);
  assert.match(decision, /Actions? allowed|adminDecisionOptions/);
  assert.match(decision, /Review decision/);
  assert.match(decision, /bg-red-700/);
});

test("moderation confirmation enters safely, traps Tab, escapes, and restores focus", () => {
  let cancelFocusCount = 0;
  const cancel = {
    focus: () => {
      cancelFocusCount += 1;
    },
  } as unknown as HTMLElement;
  const panel = {
    querySelector: () => cancel,
  } as unknown as HTMLElement;

  const initialTarget = getInitialFocusTarget(panel);
  initialTarget.focus();
  assert.equal(initialTarget, cancel);
  assert.equal(cancelFocusCount, 1);

  let triggerFocusCount = 0;
  const trigger = {
    focus: () => {
      triggerFocusCount += 1;
    },
  } as unknown as HTMLElement;
  assert.equal(restoreFocus(trigger, () => true), true);
  assert.equal(triggerFocusCount, 1);
  assert.equal(restoreFocus(trigger, () => false), false);
  assert.equal(triggerFocusCount, 1);

  assert.equal(shouldDismissLayer({ pending: false, reason: "escape" }), true);
  assert.equal(shouldDismissLayer({ pending: true, reason: "escape" }), false);
  assert.equal(shouldDismissLayer({ pending: true, reason: "backdrop" }), false);
  assert.equal(shouldDismissLayer({ pending: true, reason: "close-button" }), false);
  assert.equal(nextFocusableIndex(1, 2, "forward"), 0);
  assert.equal(nextFocusableIndex(0, 2, "backward"), 1);

  const panelSource = readFileSync("src/components/admin-moderation/decision-tools.tsx", "utf8");
  assert.match(panelSource, /dialog\.showModal\(\)/);
  assert.match(panelSource, /cancelRef\.current\?\.focus\(\)/);
  assert.match(panelSource, /if \(pending\) event\.preventDefault\(\)/);
  assert.match(panelSource, /disabled=\{pending\}/);
  assert.match(panelSource, /aria-labelledby/);
  assert.match(panelSource, /<dialog/);
});

test("report layers retain pending submissions and desktop close resets success", () => {
  const source = readFileSync("src/components/report-target-button.tsx", "utf8");

  assert.match(source, /const \[state, formAction, pending\] = useActionState/);
  assert.match(source, /onPendingChange\(pending\)/);
  assert.equal(source.match(/dismissDisabled=\{pending\}/g)?.length, 2);
  assert.equal(source.match(/onPendingChange=\{setPending\}/g)?.length, 2);
  assert.match(source, /function close\(\) \{\s*setSubmitted\(false\);\s*onClose\(\);\s*\}/);
  assert.match(source, /onDismiss=\{close\}/);
  assert.match(source, /onClick=\{close\}/);
});

test("request and seat cancellation clear stale errors but retain the seat reason", () => {
  const source = readFileSync("src/components/ride-actions.tsx", "utf8");
  const request = source.slice(
    source.indexOf("export function CancelRequestButton"),
    source.indexOf("export function CancelRideButton"),
  );
  const seat = source.slice(source.indexOf("export function CancelSeatButton"));

  for (const component of [request, seat]) {
    assert.match(component, /function setDialogOpen\(value: boolean\) \{\s*setOpen\(value\);\s*if \(!value\) setError\(null\);\s*\}/);
    assert.match(component, /onClick=\{\(\) => setDialogOpen\(true\)\}/);
    assert.match(component, /onDismiss=\{\(\) => setDialogOpen\(false\)\}/);
    assert.match(component, /onClick=\{\(\) => setDialogOpen\(false\)\}/);
  }
  assert.doesNotMatch(
    seat.slice(seat.indexOf("function setDialogOpen"), seat.indexOf("function submit")),
    /setMessage/,
  );
});

test("mobile seat-request endpoint stacks below passenger identity", () => {
  const mobileRide = readFileSync("src/app/m/rides/[id]/page.tsx", "utf8");
  const desktopRide = readFileSync("src/app/(desktop)/rides/[id]/page.tsx", "utf8");

  assert.match(mobileRide, /<div className="min-w-0">[\s\S]*endpointLabel \?\? "Location"/);
  assert.match(mobileRide, /mt-0\.5 truncate text-\[11px\] text-muted-warm/);
  assert.doesNotMatch(
    mobileRide,
    /<Link[^>]*flex min-w-0 items-center gap-2\.5">[\s\S]*<MAvatar[\s\S]*<span className="truncate[\s\S]*<p className="truncate text-\[11px\]/,
  );
  assert.match(desktopRide, /endpointLabel \?\? "Location"/);
});

test("contact-required skip copy clarifies browsing and later prompts", () => {
  const profileForm = readFileSync("src/components/profile-form.tsx", "utf8");

  assert.match(profileForm, /Keep browsing for now/);
  assert.match(profileForm, /book, post, or message/);
  assert.doesNotMatch(profileForm, />Skip for now</);
});

test("banned page uses plain user-facing recovery copy", () => {
  const bannedPage = readFileSync("src/components/banned-status-page.tsx", "utf8");

  assert.match(bannedPage, /Your access is blocked right away/);
  assert.match(bannedPage, /sign out and sign back in to continue/);
  assert.doesNotMatch(bannedPage, /Database lockout/i);
  assert.doesNotMatch(bannedPage, /session refreshes/i);
});
