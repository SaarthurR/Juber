"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { MESSAGE_BASE_TARGETS, pickAllowed } from "@/lib/route-targets";

/**
 * Finds an existing 1:1 conversation between the current user and `otherUserId`,
 * or creates one. Optional ride/request context is read from hidden form fields.
 */
export async function openConversation(otherUserId: string, formData?: FormData) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  const base = pickAllowed(formData?.get("base")?.toString(), MESSAGE_BASE_TARGETS, "/messages");
  if (user.id === otherUserId) redirect(base);

  const rideId = formData?.get("ride_id")?.toString() || null;
  const requestId = formData?.get("request_id")?.toString() || null;
  if (!rideId && !requestId) {
    throw new Error("Messaging unlocks after a ride is booked.");
  }

  if (rideId) {
    const { data: bookings } = await supabase
      .from("ride_passengers")
      .select("passenger_id,ride:rides!ride_passengers_ride_id_fkey(driver_id,status)")
      .eq("ride_id", rideId)
      .eq("status", "confirmed")
      .returns<Array<{
        passenger_id: string;
        ride: { driver_id: string; status: string } | null;
      }>>();
    const booking = bookings?.find((row) => {
      const participants = new Set([row.passenger_id, row.ride?.driver_id]);
      return participants.has(user.id) && participants.has(otherUserId);
    });
    const participants = new Set([booking?.passenger_id, booking?.ride?.driver_id]);
    if (
      booking?.ride?.status !== "active" ||
      !participants.has(user.id) ||
      !participants.has(otherUserId)
    ) {
      throw new Error("Messaging unlocks after this ride is booked.");
    }
  } else if (requestId) {
    const { data: request } = await supabase
      .from("ride_requests")
      .select("rider_id,accepted_driver_id,status")
      .eq("id", requestId)
      .maybeSingle<{
        rider_id: string;
        accepted_driver_id: string | null;
        status: string;
      }>();
    const participants = new Set([request?.rider_id, request?.accepted_driver_id]);
    if (
      request?.status !== "fulfilled" ||
      !participants.has(user.id) ||
      !participants.has(otherUserId)
    ) {
      throw new Error("Messaging unlocks after this request is accepted.");
    }
  }

  const { data: conversationId, error } = await supabase.rpc("open_conversation", {
    p_other_user_id: otherUserId,
    p_ride_id: rideId,
    p_request_id: requestId,
  });

  if (error || !conversationId) {
    throw new Error(error?.message ?? "Could not start chat");
  }

  redirect(`${base}/${conversationId}`);
}

/** Marks all of the current user's unread notifications as read. */
export async function markNotificationsRead() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);

  revalidatePath("/messages");
}

export async function sendMessage(conversationId: string, formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const body = (formData.get("body") ?? "").toString().trim();
  if (!body) return;

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/messages/${conversationId}`);
}

export async function markConversationRead(conversationId: string) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return;

  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from("messages")
    .update({ read_at: readAt })
    .eq("conversation_id", conversationId)
    .neq("sender_id", user.id)
    .is("read_at", null);

  if (error) throw new Error(error.message);

  const { error: notificationError } = await supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("recipient_id", user.id)
    .eq("type", "new_message")
    .eq("conversation_id", conversationId)
    .is("read_at", null);
  if (notificationError) throw new Error(notificationError.message);

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
}

export async function deleteConversation(conversationId: string) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { data: deleted, error } = await supabase.rpc("delete_conversation", {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error(error.message);
  if (!deleted) throw new Error("Could not delete this chat.");

  revalidatePath("/messages");
}
