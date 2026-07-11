"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { MESSAGE_BASE_TARGETS, pickAllowed } from "@/lib/route-targets";
import type { Message } from "@/lib/types";

function revalidateMessageRoutes() {
  revalidatePath("/messages");
  revalidatePath("/m/messages");
  revalidatePath("/messages/[id]", "page");
  revalidatePath("/m/messages/[id]", "page");
}

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

  const { data: conversationId, error } = await supabase.rpc("open_conversation", {
    p_other_user_id: otherUserId,
    p_ride_id: rideId,
    p_request_id: requestId,
  });

  if (error || !conversationId) {
    throw new Error(error?.message ?? "Could not start chat");
  }

  revalidateMessageRoutes();
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

  revalidateMessageRoutes();
}

export async function sendMessage(conversationId: string, formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const body = (formData.get("body") ?? "").toString().trim();
  if (!body) return { message: null, error: "Write a message before sending." };
  const clientMessageId = (formData.get("client_message_id") ?? "").toString();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId)) {
    return { message: null, error: "Could not send this message. Please try again." };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      id: clientMessageId,
      conversation_id: conversationId,
      sender_id: user.id,
      body,
    })
    .select("*")
    .single<Message>();
  if (error || !data) {
    console.error("send message failed", { code: error?.code, conversationId });
    return { message: null, error: "Could not send this message. Please try again." };
  }

  revalidateMessageRoutes();
  return { message: data, error: null };
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

  revalidateMessageRoutes();
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

  revalidateMessageRoutes();
}
