import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_REQUEST_INITIAL_STATE,
  buildEventRequestPayload,
  eventRequestError,
  eventRequestSuccess,
} from "./event-request-state";

test("buildEventRequestPayload rejects empty event names inline", () => {
  const formData = new FormData();
  formData.set("name", "  ");

  assert.deepEqual(buildEventRequestPayload(formData, "user-1"), {
    state: eventRequestError("Please add an event name."),
    payload: null,
  });
});

test("buildEventRequestPayload trims values and preserves requester identity", () => {
  const formData = new FormData();
  formData.set("name", " Paryushan ");
  formData.set("description", " Community week ");
  formData.set("venue_label", " JCNC ");
  formData.set("start_date", "2026-08-20");
  formData.set("end_date", "");
  formData.set("expected_traffic", "high");

  assert.deepEqual(buildEventRequestPayload(formData, "user-1"), {
    state: EVENT_REQUEST_INITIAL_STATE,
    payload: {
      name: "Paryushan",
      description: "Community week",
      venue_label: "JCNC",
      start_date: "2026-08-20",
      end_date: null,
      source_url: null,
      expected_traffic: "high",
      requested_by: "user-1",
    },
  });
});

test("buildEventRequestPayload rejects invalid source URLs", () => {
  const formData = new FormData();
  formData.set("name", "Paryushan");
  formData.set("source_url", "javascript:alert(1)");

  assert.deepEqual(buildEventRequestPayload(formData, "user-1"), {
    state: eventRequestError("Please enter a valid http or https URL."),
    payload: null,
  });
});

test("buildEventRequestPayload accepts https source URLs", () => {
  const formData = new FormData();
  formData.set("name", "Paryushan");
  formData.set("source_url", "https://jcnc.org/events/paryushan");

  const result = buildEventRequestPayload(formData, "user-1");
  assert.equal(result.payload?.source_url, "https://jcnc.org/events/paryushan");
});

test("eventRequestSuccess asks the client to reset the form", () => {
  assert.deepEqual(eventRequestSuccess(), {
    status: "success",
    message: "Sent to admins. It will appear here once approved.",
    resetKey: 1,
  });
});
