export type EventRequestActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  resetKey: number;
};

export type EventRequestPayload = {
  name: string;
  description: string | null;
  venue_label: string | null;
  start_date: string | null;
  end_date: string | null;
  expected_traffic: "unsure" | "high";
  requested_by: string;
};

export const EVENT_REQUEST_INITIAL_STATE: EventRequestActionState = {
  status: "idle",
  message: null,
  resetKey: 0,
};

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

export function eventRequestError(message: string): EventRequestActionState {
  return { status: "error", message, resetKey: 0 };
}

export function eventRequestSuccess(
  previousState: EventRequestActionState = EVENT_REQUEST_INITIAL_STATE,
): EventRequestActionState {
  return {
    status: "success",
    message: "Sent to admins. It will appear here once approved.",
    resetKey: previousState.resetKey + 1,
  };
}

export function buildEventRequestPayload(formData: FormData, userId: string) {
  const name = str(formData.get("name"));
  if (!name) {
    return { state: eventRequestError("Please add an event name."), payload: null };
  }

  const expectedTraffic = str(formData.get("expected_traffic"));

  return {
    state: EVENT_REQUEST_INITIAL_STATE,
    payload: {
      name,
      description: str(formData.get("description")),
      venue_label: str(formData.get("venue_label")),
      start_date: str(formData.get("start_date")),
      end_date: str(formData.get("end_date")),
      expected_traffic: expectedTraffic === "high" ? "high" : "unsure",
      requested_by: userId,
    } satisfies EventRequestPayload,
  };
}
