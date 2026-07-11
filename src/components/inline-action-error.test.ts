import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineActionError } from "./inline-action-error";

test("InlineActionError renders an announced error region", () => {
  const markup = renderToStaticMarkup(
    createElement(InlineActionError, {
      id: "reserve-error",
      error: "This ride is full",
      className: "error",
    }),
  );

  assert.match(markup, /role="alert"/);
  assert.match(markup, /id="reserve-error"/);
  assert.match(markup, /This ride is full/);
});

test("InlineActionError renders nothing without an error", () => {
  const markup = renderToStaticMarkup(
    createElement(InlineActionError, {
      error: null,
      className: "error",
    }),
  );

  assert.equal(markup, "");
});
