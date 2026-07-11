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

test("EventRequestForm keeps success feedback visible after reset closes the fields", () => {
  const markup = renderToStaticMarkup(
    createElement(EventRequestForm, {
      signedIn: true,
      initialState: {
        status: "success",
        message: "Sent to admins. It will appear here once approved.",
        resetKey: 1,
      },
    }),
  );

  const statusAt = markup.indexOf('role="status"');
  const detailsAt = markup.indexOf("<details");

  assert.ok(statusAt >= 0, "success must render in an accessible status region");
  assert.ok(detailsAt >= 0, "the secondary form remains a disclosure");
  assert.ok(statusAt < detailsAt, "success must remain outside the closed disclosure");
  assert.doesNotMatch(markup, /<details[^>]*open/);
});
