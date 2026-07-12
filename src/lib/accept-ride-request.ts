import type { SupabaseClient } from "@supabase/supabase-js";
import { hasContact } from "@/lib/contact-readiness";

type AcceptClient = Pick<SupabaseClient, "from" | "rpc">;

export type AcceptRideRequestResult =
  | { status: "contact_required" }
  | { status: "error"; error: string }
  | { status: "success"; conversationId: string };

export async function acceptRideRequestForUser(
  supabase: AcceptClient,
  userId: string,
  requestId: string,
): Promise<AcceptRideRequestResult> {
  if (!(await hasContact(supabase, userId))) {
    return { status: "contact_required" };
  }

  const { data: request } = await supabase
    .from("ride_requests")
    .select("rider_id")
    .eq("id", requestId)
    .single<{ rider_id: string }>();
  if (!request) return { status: "error", error: "Could not find this request." };
  if (request.rider_id === userId) {
    return { status: "error", error: "You cannot accept your own ride request." };
  }

  const { data: accepted, error } = await supabase.rpc("accept_ride_request", {
    p_request_id: requestId,
  });
  if (error) return { status: "error", error: error.message };
  if (!accepted) {
    return { status: "error", error: "This request is no longer available." };
  }

  const { data: conversationId, error: conversationError } = await supabase.rpc(
    "open_conversation",
    {
      p_other_user_id: request.rider_id,
      p_ride_id: null,
      p_request_id: requestId,
    },
  );
  if (conversationError || !conversationId) {
    return {
      status: "error",
      error: conversationError?.message ?? "Could not start chat.",
    };
  }

  return { status: "success", conversationId };
}
