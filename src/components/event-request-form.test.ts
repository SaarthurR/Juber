import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventRequestForm } from "./event-request-form";

test("EventRequestForm is collapsed by default with secondary ride-board copy", () => {
  const markup = renderToStaticMarkup(createElement(EventRequestForm, { signedIn: true }));

  assert.match(markup, /<details/);
  assert.doesNotMatch(markup, /<details[^>]*open/);
  assert.match(markup, /Don&#x27;t see your event\? Request a ride board/);
});

test("EventRequestForm renders typed action-state feedback", () => {
  const markup = renderToStaticMarkup(
    createElement(EventRequestForm, {
      signedIn: true,
      initialState: {
        status: "error",
        message: "Please add an event name.",
        resetKey: 0,
      },
    }),
  );

  assert.match(markup, /role="alert"/);
  assert.match(markup, /Please add an event name\./);
});
