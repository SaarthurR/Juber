import {
  adminActionError,
  adminActionInfo,
  adminActionSuccess,
  type AdminActionState,
} from "./admin-action-state";
import {
  isApproveEventRequestV2Result,
  isRejectEventRequestV2Result,
  rejectV2OutcomeToAdminState,
  type ApproveEventRequestV2Outcome,
  type RejectEventRequestV2Outcome,
} from "./admin-approval";

type DatabaseError = { message: string };
type DeleteResult = {
  data: { id: string } | null;
  error: DatabaseError | null;
};
type RpcResult = {
  data: unknown;
  error: DatabaseError | null;
};

type AdminDeleteQuery = {
  delete: () => AdminDeleteQuery;
  eq: (column: string, value: unknown) => AdminDeleteQuery;
  select: (columns: string) => AdminDeleteQuery;
  maybeSingle: () => Promise<DeleteResult>;
};

export type AdminReviewClient = {
  from: (table: string) => AdminDeleteQuery;
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

type AdminReviewDependencies = {
  requireAdmin: () => Promise<{ supabase: AdminReviewClient }>;
  revalidatePath: (path: string) => void;
  actionErrorMessage?: (error: unknown, fallback: string) => string;
};

type DeleteContract = {
  table: "events" | "places" | "event_requests";
  successMessage: string;
  staleMessage: string;
  errorFallback: string;
  revalidate: readonly string[];
};

const DELETE_CONTRACTS = {
  event: {
    table: "events",
    successMessage: "Event deleted.",
    staleMessage: "Event was already deleted.",
    errorFallback: "Could not delete event.",
    revalidate: ["/admin", "/events", "/m/events"],
  },
  place: {
    table: "places",
    successMessage: "Location deleted.",
    staleMessage: "Location was already deleted.",
    errorFallback: "Could not delete location.",
    revalidate: ["/admin"],
  },
  request: {
    table: "event_requests",
    successMessage: "Request deleted.",
    staleMessage: "Request was already deleted.",
    errorFallback: "Could not delete request.",
    revalidate: ["/admin"],
  },
} as const satisfies Record<string, DeleteContract>;

function fallbackErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function approvalMessage(outcome: ApproveEventRequestV2Outcome) {
  switch (outcome) {
    case "approved":
      return "Event approved and published.";
    case "already_approved":
      return "Request was already approved.";
    case "already_rejected":
      return "Request was already rejected.";
    case "missing":
      return "Request not found.";
  }
}

function rejectionMessage(outcome: RejectEventRequestV2Outcome) {
  switch (outcome) {
    case "rejected":
      return "Request rejected.";
    case "already_rejected":
      return "Request was already rejected.";
    case "already_approved":
      return "Request was already approved.";
    case "missing":
      return "Request not found.";
  }
}

export function createAdminReviewActions({
  requireAdmin,
  revalidatePath,
  actionErrorMessage = fallbackErrorMessage,
}: AdminReviewDependencies) {
  async function deleteWithContract(
    id: string,
    previousState: AdminActionState,
    contract: DeleteContract,
  ): Promise<AdminActionState> {
    try {
      const { supabase } = await requireAdmin();
      const { data, error } = await supabase
        .from(contract.table)
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) return adminActionError(error.message);

      for (const path of contract.revalidate) revalidatePath(path);

      if (!data?.id) return adminActionInfo(contract.staleMessage);
      return adminActionSuccess(contract.successMessage, previousState);
    } catch (error) {
      return adminActionError(
        actionErrorMessage(error, contract.errorFallback),
      );
    }
  }

  return {
    deleteEvent(eventId: string, previousState: AdminActionState) {
      return deleteWithContract(
        eventId,
        previousState,
        DELETE_CONTRACTS.event,
      );
    },

    deletePlace(placeId: string, previousState: AdminActionState) {
      return deleteWithContract(
        placeId,
        previousState,
        DELETE_CONTRACTS.place,
      );
    },

    deleteEventRequest(
      requestId: string,
      previousState: AdminActionState,
    ) {
      return deleteWithContract(
        requestId,
        previousState,
        DELETE_CONTRACTS.request,
      );
    },

    async approveEventRequest(
      requestId: string,
      previousState: AdminActionState,
    ): Promise<AdminActionState> {
      try {
        const { supabase } = await requireAdmin();
        const { data, error } = await supabase.rpc(
          "approve_event_request_v2",
          { p_request_id: requestId },
        );

        if (error) return adminActionError(error.message);
        if (!isApproveEventRequestV2Result(data)) {
          return adminActionError("Could not approve this request.");
        }

        if (
          data.outcome === "approved" ||
          data.outcome === "already_approved"
        ) {
          revalidatePath("/admin");
          revalidatePath("/events");
          revalidatePath("/m/events");
        } else {
          revalidatePath("/admin");
        }

        const message = approvalMessage(data.outcome);
        return data.outcome === "approved"
          ? adminActionSuccess(message, previousState)
          : adminActionInfo(message);
      } catch (error) {
        return adminActionError(
          actionErrorMessage(error, "Could not approve request."),
        );
      }
    },

    async rejectEventRequest(
      requestId: string,
      previousState: AdminActionState,
    ): Promise<AdminActionState> {
      try {
        const { supabase } = await requireAdmin();
        const { data, error } = await supabase.rpc(
          "reject_event_request_v2",
          { p_request_id: requestId },
        );

        if (error) return adminActionError(error.message);
        if (!isRejectEventRequestV2Result(data)) {
          return adminActionError("Could not reject this request.");
        }

        if (data.outcome === "rejected") {
          revalidatePath("/admin");
          revalidatePath("/events");
          revalidatePath("/m/events");
        } else {
          revalidatePath("/admin");
        }

        const nextState = rejectV2OutcomeToAdminState(data.outcome, previousState);
        if (data.outcome === "rejected") {
          return { ...nextState, resetKey: nextState.resetKey };
        }
        return adminActionInfo(rejectionMessage(data.outcome));
      } catch (error) {
        return adminActionError(
          actionErrorMessage(error, "Could not reject request."),
        );
      }
    },
  };
}
