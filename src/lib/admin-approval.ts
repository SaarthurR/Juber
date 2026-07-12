export type EventRequestReviewStatus = "pending" | "approved" | "rejected";

export type ApproveEventRequestV2Outcome =
  | "approved"
  | "already_approved"
  | "already_rejected"
  | "missing";

export type ApproveEventRequestV2Result = {
  outcome: ApproveEventRequestV2Outcome;
  event_id: string | null;
};

export type RejectEventRequestV2Outcome =
  | "rejected"
  | "already_rejected"
  | "already_approved"
  | "missing";

export type RejectEventRequestV2Result = {
  outcome: RejectEventRequestV2Outcome;
  event_id: string | null;
};

export type RejectEventRequestOutcome =
  | { kind: "rejected"; message: string }
  | { kind: "already_rejected"; message: string }
  | { kind: "already_approved"; message: string }
  | { kind: "missing"; message: string }
  | { kind: "error"; message: string };

export function isRejectEventRequestV2Result(
  value: unknown,
): value is RejectEventRequestV2Result {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<RejectEventRequestV2Result>;
  const validOutcome =
    result.outcome === "rejected" ||
    result.outcome === "already_rejected" ||
    result.outcome === "already_approved" ||
    result.outcome === "missing";

  return (
    validOutcome &&
    (result.event_id === null || typeof result.event_id === "string")
  );
}

export function rejectV2OutcomeToAdminState(
  outcome: RejectEventRequestV2Outcome,
  previousState: { resetKey: number },
): { status: "error" | "success" | "info"; message: string; resetKey: number } {
  switch (outcome) {
    case "rejected":
      return {
        status: "success",
        message: "Request rejected.",
        resetKey: previousState.resetKey + 1,
      };
    case "already_rejected":
      return {
        status: "info",
        message: "Request was already rejected.",
        resetKey: 0,
      };
    case "already_approved":
      return {
        status: "info",
        message: "Request was already approved.",
        resetKey: 0,
      };
    case "missing":
      return { status: "info", message: "Request not found.", resetKey: 0 };
  }
}

export function isApproveEventRequestV2Result(
  value: unknown,
): value is ApproveEventRequestV2Result {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<ApproveEventRequestV2Result>;
  const validOutcome =
    result.outcome === "approved" ||
    result.outcome === "already_approved" ||
    result.outcome === "already_rejected" ||
    result.outcome === "missing";

  return (
    validOutcome &&
    (result.event_id === null || typeof result.event_id === "string")
  );
}

export function interpretRejectEventRequest({
  beforeStatus,
  updated,
  afterStatus,
  updateError,
}: {
  beforeStatus: EventRequestReviewStatus | null;
  updated: boolean;
  afterStatus: EventRequestReviewStatus | null;
  updateError: string | null;
}): RejectEventRequestOutcome {
  if (updateError) {
    return { kind: "error", message: updateError };
  }

  if (beforeStatus === null && afterStatus === null) {
    return { kind: "missing", message: "Request not found." };
  }

  if (updated) {
    return { kind: "rejected", message: "Request rejected." };
  }

  if (afterStatus === "approved") {
    return { kind: "already_approved", message: "Request was already approved." };
  }

  if (afterStatus === "rejected") {
    return { kind: "already_rejected", message: "Request was already rejected." };
  }

  if (beforeStatus === null) {
    return { kind: "missing", message: "Request not found." };
  }

  return { kind: "error", message: "Could not reject this request." };
}

export function rejectOutcomeToAdminState(
  outcome: RejectEventRequestOutcome,
  previousState: { resetKey: number },
): { status: "error" | "success" | "info"; message: string; resetKey: number } {
  switch (outcome.kind) {
    case "rejected":
      return {
        status: "success",
        message: outcome.message,
        resetKey: previousState.resetKey + 1,
      };
    case "already_rejected":
    case "already_approved":
      return { status: "info", message: outcome.message, resetKey: 0 };
    case "missing":
    case "error":
      return { status: outcome.kind === "error" ? "error" : "info", message: outcome.message, resetKey: 0 };
  }
}
