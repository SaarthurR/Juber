import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignOutForm, SignOutFormView } from "./sign-out-form";

const desktopProfile = readFileSync(
  new URL("../app/profile/page.tsx", import.meta.url),
  "utf8",
);
const mobileProfile = readFileSync(
  new URL("../app/m/profile/page.tsx", import.meta.url),
  "utf8",
);
const signOutAction = readFileSync(
  new URL("../app/auth/actions.ts", import.meta.url),
  "utf8",
);
const signOutRoute = readFileSync(
  new URL("../app/auth/signout/route.ts", import.meta.url),
  "utf8",
);

const noopAction = async (formData: FormData) => {
  void formData;
};

test("desktop sign-out view renders a function-action form and visible error recovery", () => {
  const idle = renderToStaticMarkup(
    createElement(SignOutFormView, {
      variant: "desktop",
      state: null,
      formAction: noopAction,
    }),
  );
  const failed = renderToStaticMarkup(
    createElement(SignOutFormView, {
      variant: "desktop",
      state: { error: "We couldn't sign you out. Please try again." },
      formAction: noopAction,
    }),
  );

  assert.match(idle, /<form/);
  assert.match(idle, />Sign out<\/button>/);
  assert.doesNotMatch(idle, /\/auth\/signout/);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /We couldn&#x27;t sign you out\. Please try again\./);
});

test("mobile sign-out view keeps an accessible icon label", () => {
  const markup = renderToStaticMarkup(
    createElement(SignOutFormView, {
      variant: "mobile",
      state: null,
      formAction: noopAction,
    }),
  );

  assert.match(markup, /<form/);
  assert.match(markup, /<span class="sr-only">Sign out<\/span>/);
  assert.doesNotMatch(markup, /\/auth\/signout/);
});

test("SignOutForm renders its React-managed action wrapper", () => {
  const markup = renderToStaticMarkup(
    createElement(SignOutForm, { variant: "desktop" }),
  );

  assert.match(markup, /<form/);
  assert.match(markup, />Sign out<\/button>/);
  assert.doesNotMatch(markup, /\/auth\/signout/);
});

test("profile pages integrate the React-managed sign-out component, not a URL action", () => {
  for (const source of [desktopProfile, mobileProfile]) {
    assert.match(source, /<SignOutForm/);
    assert.doesNotMatch(source, /action="\/auth\/signout"/);
  }
});

test("sign-out action uses the tested redirect contract and keeps POST compatibility", () => {
  assert.match(signOutAction, /completeSignOut\(createClient, redirect\)/);
  assert.match(signOutRoute, /export async function POST/);
  assert.match(signOutRoute, /performSignOut\(createClient\)/);
  assert.match(signOutRoute, /status: 303/);
});
