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

  let existingId: string | null = null;

  if (rideId || requestId) {
    let contextQuery = supabase.from("conversations").select("id");
    if (rideId) contextQuery = contextQuery.eq("ride_id", rideId);
    if (requestId) contextQuery = contextQuery.eq("request_id", requestId);
    const { data: contextConvos } = await contextQuery;
    const contextIds = (contextConvos ?? []).map((r) => r.id);
    if (contextIds.length) {
      const { data: shared } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", otherUserId)
        .in("conversation_id", contextIds)
        .limit(1);
      existingId = shared?.[0]?.conversation_id ?? null;
    }
  } else {
    // Find conversations the current user is in, then check if the other user
    // is also a participant.
    const { data: mine } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    const myConvoIds = (mine ?? []).map((r) => r.conversation_id);

    if (myConvoIds.length) {
      const { data: shared } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", otherUserId)
        .in("conversation_id", myConvoIds)
        .limit(1);
      existingId = shared?.[0]?.conversation_id ?? null;
    }
  }

  if (existingId) redirect(`/messages/${existingId}`);

  const { data: convo, error } = await supabase
    .from("conversations")
    .insert({ ride_id: rideId, request_id: requestId })
    .select("id")
    .single();
  if (error || !convo) throw new Error(error?.message ?? "Could not start chat");

  const { error: pErr } = await supabase.from("conversation_participants").insert([
    { conversation_id: convo.id, user_id: user.id },
    { conversation_id: convo.id, user_id: otherUserId },
  ]);
  if (pErr) throw new Error(pErr.message);

  redirect(`/messages/${convo.id}`);
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
