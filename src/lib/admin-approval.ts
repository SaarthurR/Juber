export type EventRequestReviewStatus = "pending" | "approved" | "rejected";

export type ApproveEventRequestOutcome =
  | { kind: "approved"; message: string }
  | { kind: "already_approved"; message: string }
  | { kind: "missing"; message: string }
  | { kind: "rejected"; message: string }
  | { kind: "error"; message: string };

export type RejectEventRequestOutcome =
  | { kind: "rejected"; message: string }
  | { kind: "already_rejected"; message: string }
  | { kind: "already_approved"; message: string }
  | { kind: "missing"; message: string }
  | { kind: "error"; message: string };

export function interpretApproveEventRequest({
  beforeStatus,
  rpcEventId,
  afterStatus,
  rpcError,
}: {
  beforeStatus: EventRequestReviewStatus | null;
  rpcEventId: string | null;
  afterStatus: EventRequestReviewStatus | null;
  rpcError: string | null;
}): ApproveEventRequestOutcome {
  if (rpcError) {
    return { kind: "error", message: rpcError };
  }

  if (beforeStatus === null && afterStatus === null) {
    return { kind: "missing", message: "Request not found." };
  }

  if (beforeStatus === "rejected" || afterStatus === "rejected") {
    return { kind: "rejected", message: "Request was already rejected." };
  }

  if (rpcEventId) {
    if (beforeStatus === "pending") {
      return { kind: "approved", message: "Event approved and published." };
    }
    return { kind: "already_approved", message: "Request was already approved." };
  }

  if (beforeStatus === null) {
    return { kind: "missing", message: "Request not found." };
  }

  return { kind: "error", message: "Could not approve this request." };
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

export function approveOutcomeToAdminState(
  outcome: ApproveEventRequestOutcome,
  previousState: { resetKey: number },
): { status: "error" | "success" | "info"; message: string; resetKey: number } {
  switch (outcome.kind) {
    case "approved":
      return {
        status: "success",
        message: outcome.message,
        resetKey: previousState.resetKey + 1,
      };
    case "already_approved":
      return { status: "info", message: outcome.message, resetKey: 0 };
    case "missing":
    case "rejected":
    case "error":
      return { status: outcome.kind === "error" ? "error" : "info", message: outcome.message, resetKey: 0 };
  }
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
