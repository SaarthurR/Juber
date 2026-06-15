"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

/**
 * Finds an existing 1:1 conversation between the current user and `otherUserId`
 * (optionally tied to a ride), or creates one. Redirects into the thread.
 */
export async function openConversation(otherUserId: string, rideId?: string) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  if (user.id === otherUserId) redirect("/messages");

  // Find conversations the current user is in, then check if the other user
  // is also a participant.
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  const myConvoIds = (mine ?? []).map((r) => r.conversation_id);

  let existingId: string | null = null;
  if (myConvoIds.length) {
    const { data: shared } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", otherUserId)
      .in("conversation_id", myConvoIds)
      .limit(1);
    existingId = shared?.[0]?.conversation_id ?? null;
  }

  if (existingId) redirect(`/messages/${existingId}`);

  const { data: convo, error } = await supabase
    .from("conversations")
    .insert({ ride_id: rideId ?? null })
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
