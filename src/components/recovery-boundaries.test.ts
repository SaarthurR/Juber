import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import DesktopError from "@/app/(desktop)/error";
import MobileError from "@/app/m/error";
import RootError from "@/app/error";
import NotFound from "@/app/not-found";

test("recovery boundaries announce failures and activate retry", () => {
  for (const Boundary of [DesktopError, MobileError, RootError]) {
    let retries = 0;
    const element = Boundary({ unstable_retry: () => retries++ });
    const button = Array.isArray(element.props.children)
      ? element.props.children.find(
          (child: { type?: string }) => child?.type === "button",
        )
      : null;

    assert.match(renderToStaticMarkup(element), /role="alert"/);
    assert.equal(typeof button?.props.onClick, "function");
    button.props.onClick();
    assert.equal(retries, 1);
  }
});

test("root not-found renders branded recovery without leaking error details", () => {
  const markup = renderToStaticMarkup(NotFound());

  assert.match(markup, /Page not found/);
  assert.match(markup, /Back to home/);
  assert.match(markup, /href="\/"/);
  assert.match(markup, /min-h-11/);
  assert.doesNotMatch(markup, /digest/i);
  assert.doesNotMatch(markup, /error\.message/i);
});

test("root and global recovery files are client components with unstable_retry", () => {
  for (const file of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /"use client"/);
    assert.match(source, /unstable_retry/);
    assert.match(source, /role="alert"/);
    assert.doesNotMatch(source, /error\.message/);
  }

  const globalError = readFileSync("src/app/global-error.tsx", "utf8");
  assert.match(globalError, /<html/);
  assert.match(globalError, /<body/);
  assert.match(globalError, /globals\.css/);
});

test("requestSeat contact errors surface through InlineActionError with profile link", () => {
  const reserveForm = readFileSync("src/components/reserve-seat-form.tsx", "utf8");
  const ridesActions = readFileSync("src/app/rides/actions.ts", "utf8");
  const requestSeat = ridesActions.slice(
    ridesActions.indexOf("export async function requestSeat"),
    ridesActions.indexOf("export async function setPassengerStatus"),
  );

  assert.match(reserveForm, /InlineActionError/);
  assert.match(reserveForm, /setupPath/);
  assert.match(reserveForm, /Finish contact info in profile/);
  assert.match(requestSeat, /setupPath: contactSetupDestination/);
  assert.match(requestSeat, /error: CONTACT_SETUP_MESSAGE/);
  assert.doesNotMatch(requestSeat, /hasContact[\s\S]*redirect\(/);
});
