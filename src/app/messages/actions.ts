"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

/**
 * Finds an existing 1:1 conversation between the current user and `otherUserId`,
 * or creates one. Optional ride/request context is read from hidden form fields.
 */
export async function openConversation(otherUserId: string, formData?: FormData) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  if (user.id === otherUserId) redirect("/messages");

  const rideId = formData?.get("ride_id")?.toString() || null;
  const requestId = formData?.get("request_id")?.toString() || null;

  const { data: conversationId, error } = await supabase.rpc("open_conversation", {
    p_other_user_id: otherUserId,
    p_ride_id: rideId,
    p_request_id: requestId,
  });

  if (error || !conversationId) {
    throw new Error(error?.message ?? "Could not start chat");
  }

  redirect(`/messages/${conversationId}`);
}

/** Marks all of the current user's unread notifications as read. */
export async function markNotificationsRead() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

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
  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
}
