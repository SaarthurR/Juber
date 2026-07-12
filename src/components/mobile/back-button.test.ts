import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackButtonView } from "./back-button";

test("BackButtonView can opt public shell navigation out of the auth gate", () => {
  const markup = renderToStaticMarkup(
    createElement(BackButtonView, {
      allowAnonymousBrowse: true,
      onBack: () => undefined,
    }),
  );

  assert.match(markup, /aria-label="Back"/);
  assert.match(markup, /data-auth-allowed="true"/);
  assert.match(markup, /class="flex h-11 w-11 shrink-0/);
});

test("BackButtonView keeps other Back controls gated by default", () => {
  const markup = renderToStaticMarkup(
    createElement(BackButtonView, {
      onBack: () => undefined,
    }),
  );

  assert.doesNotMatch(markup, /data-auth-allowed/);
});
