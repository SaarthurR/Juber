import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AdminCreateEventForm,
  AdminCreatePlaceForm,
  AdminEventRequestCard,
} from "./admin-forms";

test("AdminCreateEventForm exposes a pasteable source URL field", () => {
  const markup = renderToStaticMarkup(createElement(AdminCreateEventForm));
  assert.match(markup, /name="source_url"/);
  assert.match(markup, /type="url"/);
});

test("AdminCreatePlaceForm labels the optional event attach select accurately", () => {
  const markup = renderToStaticMarkup(
    createElement(AdminCreatePlaceForm, { events: [] }),
  );
  assert.match(markup, /Attach to event \(optional\)/);
  assert.doesNotMatch(markup, /Link to event/);
});

test("AdminEventRequestCard reuses the safe normalized source link", () => {
  const markup = renderToStaticMarkup(
    createElement(AdminEventRequestCard, {
      request: {
        id: "request-1",
        name: "Paryushan",
        description: null,
        venue_label: "JCNC",
        start_date: "2026-08-20",
        end_date: null,
        source: "user",
        source_url: "HTTPS://Example.COM:443/event",
        expected_traffic: "high",
        status: "pending",
        requested_by: "user-1",
        reviewed_by: null,
        approved_event_id: null,
        reviewed_at: null,
        created_at: "2026-07-12T00:00:00Z",
        requester: { id: "user-1", full_name: "Requester" },
      },
    }),
  );

  assert.match(markup, /href="https:\/\/example\.com\/event"/);
  assert.match(markup, /rel="noopener noreferrer"/);
});
