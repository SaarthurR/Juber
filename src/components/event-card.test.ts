import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "./event-card";

const event = {
  id: "event-1",
  name: "Paryushan",
  slug: "paryushan",
  description: null,
  venue_label: "JCNC",
  start_date: "2026-08-20",
  end_date: null,
  source_url: null,
  is_active: true,
  created_by: null,
  created_at: "2026-07-11T00:00:00Z",
};

test("EventCard uses ride-board terminology without View board drift", () => {
  const markup = renderToStaticMarkup(createElement(EventCard, { event }));

  assert.match(markup, /View rides/);
  assert.doesNotMatch(markup, /View board/);
});

test("EventCard can be marked as an anonymous browse affordance", () => {
  const markup = renderToStaticMarkup(
    createElement(EventCard, {
      event,
      allowAnonymousBrowse: true,
    }),
  );

  assert.match(markup, /data-auth-allowed="true"/);
});
