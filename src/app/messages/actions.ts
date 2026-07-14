"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { MESSAGE_BASE_TARGETS, contactActionReturnPath, contactSetupDestination, pickAllowed } from "@/lib/route-targets";
import { messageMatchesRetry } from "@/lib/messages";
import { CONTACT_SETUP_MESSAGE } from "@/lib/contact-setup";
import { hasContact } from "@/lib/contact-readiness";
import { requireNotificationWriteAuthentication } from "@/lib/notifications-controller";
import { mapRateLimitError } from "@/lib/rate-limit";
import type { Message } from "@/lib/types";
import { getDemoRuntime, getDemoStore } from "@/lib/demo/runtime";

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
  const demo = await getDemoRuntime();
  if (demo) {
    const base = pickAllowed(formData?.get("base")?.toString(), MESSAGE_BASE_TARGETS, "/messages");
    if (demo.activeActorId === otherUserId) redirect(base);
    const rideId = formData?.get("ride_id")?.toString() || null;
    const requestId = formData?.get("request_id")?.toString() || null;
    if (!rideId && !requestId) throw new Error("Messaging unlocks after a ride is booked.");
    const next = await getDemoStore().mutate(demo.id, demo.revision, {
      type: "open_conversation",
      actorId: demo.activeActorId,
      otherUserId,
      rideId,
      requestId,
    });
    const conversation = Object.values(next.state.conversations).find(
      (item) => item.participantIds.includes(demo.activeActorId)
        && item.participantIds.includes(otherUserId)
        && item.rideId === rideId
        && item.requestId === requestId,
    );
    if (!conversation) throw new Error("Could not start chat");
    revalidateMessageRoutes();
    redirect(`${base}/${conversation.id}`);
  }
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  const base = pickAllowed(formData?.get("base")?.toString(), MESSAGE_BASE_TARGETS, "/messages");
  if (user.id === otherUserId) redirect(base);

  if (!(await hasContact(supabase, user.id))) {
    const returnPath = contactActionReturnPath(formData, base);
    const mobile = returnPath.startsWith("/m");
    redirect(contactSetupDestination(returnPath, { mobile }));
  }

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
  const demo = await getDemoRuntime();
  if (demo) {
    await getDemoStore().mutate(demo.id, demo.revision, {
      type: "mark_all_notifications",
      actorId: demo.activeActorId,
    });
    revalidateMessageRoutes();
    return;
  }
  const supabase = await createClient();
  const user = requireNotificationWriteAuthentication(await getAuthUser(supabase));

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);

  revalidateMessageRoutes();
}

/** Marks exactly one current-user notification as read. */
export async function markNotificationRead(notificationId: string) {
  const demo = await getDemoRuntime();
  if (demo) {
    await getDemoStore().mutate(demo.id, demo.revision, {
      type: "mark_notification",
      actorId: demo.activeActorId,
      notificationId,
    });
    revalidateMessageRoutes();
    return;
  }
  const supabase = await createClient();
  const user = requireNotificationWriteAuthentication(await getAuthUser(supabase));

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", user.id)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not mark notification read.");

  revalidateMessageRoutes();
}

export async function sendMessage(conversationId: string, formData: FormData) {
  const demo = await getDemoRuntime();
  if (demo) {
    const body = (formData.get("body") ?? "").toString().trim();
    if (!body) return { message: null, error: "Write a message before sending." };
    const clientMessageId = (formData.get("client_message_id") ?? "").toString();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId)) {
      return { message: null, error: "Could not send this message. Please try again." };
    }
    if (!demo.state.contacts[demo.activeActorId]?.phone && !demo.state.contacts[demo.activeActorId]?.whatsapp) {
      const returnPath = contactActionReturnPath(formData, `/messages/${conversationId}`);
      return {
        message: null,
        error: CONTACT_SETUP_MESSAGE,
        setupPath: contactSetupDestination(returnPath, { mobile: returnPath.startsWith("/m") }),
      };
    }
    try {
      const next = await getDemoStore().mutate(demo.id, demo.revision, {
        type: "send_message",
        actorId: demo.activeActorId,
        conversationId,
        body,
        clientMessageId,
      });
      revalidateMessageRoutes();
      return { message: next.state.messages[clientMessageId] ?? null, error: null };
    } catch (error) {
      return { message: null, error: error instanceof Error ? error.message : "Could not send this message. Please try again." };
    }
  }
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  if (!(await hasContact(supabase, user.id))) {
    const returnPath = contactActionReturnPath(
      formData,
      `/messages/${conversationId}`,
    );
    const mobile = returnPath.startsWith("/m");
    return {
      message: null,
      error: CONTACT_SETUP_MESSAGE,
      setupPath: contactSetupDestination(returnPath, { mobile }),
    };
  }

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
  if (error?.code === "23505") {
    const { data: existing, error: readbackError } = await supabase
      .from("messages")
      .select("*")
      .eq("id", clientMessageId)
      .maybeSingle<Message>();
    if (
      !readbackError &&
      existing &&
      messageMatchesRetry(existing, {
        id: clientMessageId,
        conversation_id: conversationId,
        sender_id: user.id,
        body,
      })
    ) {
      revalidateMessageRoutes();
      return { message: existing, error: null };
    }
  }
  if (error || !data) {
    const rateMsg = mapRateLimitError(error);
    if (rateMsg) return { message: null, error: rateMsg };
    console.error("send message failed", { code: error?.code, conversationId });
    return { message: null, error: "Could not send this message. Please try again." };
  }

  revalidateMessageRoutes();
  return { message: data, error: null };
}

export async function markConversationRead(conversationId: string) {
  const demo = await getDemoRuntime();
  if (demo) {
    await getDemoStore().mutate(demo.id, undefined, {
      type: "read_messages",
      actorId: demo.activeActorId,
      conversationId,
    });
    revalidateMessageRoutes();
    return;
  }
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return;

  const readAt = new Date().toISOString();
  const { data: hide, error: hideError } = await supabase
    .from("conversation_hides")
    .select("hidden_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle<{ hidden_at: string }>();
  if (hideError) throw new Error(hideError.message);

  let messageUpdate = supabase
    .from("messages")
    .update({ read_at: readAt })
    .eq("conversation_id", conversationId)
    .neq("sender_id", user.id)
    .is("read_at", null);
  if (hide?.hidden_at) messageUpdate = messageUpdate.gt("created_at", hide.hidden_at);
  const { error } = await messageUpdate;

  if (error) throw new Error(error.message);

  let notificationUpdate = supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("recipient_id", user.id)
    .eq("type", "new_message")
    .eq("conversation_id", conversationId)
    .is("read_at", null);
  if (hide?.hidden_at) {
    notificationUpdate = notificationUpdate.gt("created_at", hide.hidden_at);
  }
  const { error: notificationError } = await notificationUpdate;
  if (notificationError) throw new Error(notificationError.message);

  revalidateMessageRoutes();
}

export async function deleteConversation(conversationId: string) {
  const demo = await getDemoRuntime();
  if (demo) {
    await getDemoStore().mutate(demo.id, demo.revision, {
      type: "hide_conversation",
      actorId: demo.activeActorId,
      conversationId,
    });
    revalidateMessageRoutes();
    return;
  }
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
