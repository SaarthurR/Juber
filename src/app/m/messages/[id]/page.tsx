import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { MessageThread } from "@/components/message-thread";
import type { Message } from "@/lib/types";
import { loadThreadSummaries, newestThreadMessages } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Mobile conversation thread — same component as desktop, but the back arrow
// returns to the mobile inbox so the user stays in the /m phone shell.
export default async function MobileThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getCurrentUser();
  if (!user) redirect("/m");
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) throw new Error("Could not verify conversation access.");
  if (!membership) notFound();

  const [thread] = await loadThreadSummaries(supabase, user.id, id);
  if (!thread) redirect("/m/messages");

  let messageQuery = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (thread.hiddenAt) {
    messageQuery = messageQuery.gt("created_at", thread.hiddenAt);
  }
  const { data: messages, error: messageError } = await messageQuery;
  if (messageError) throw new Error("Could not load this conversation.");

  return (
    <MessageThread
      key={id}
      conversationId={id}
      currentUserId={user.id}
      other={thread.other}
      initialMessages={newestThreadMessages((messages as Message[]) ?? [])}
      backHref="/m/messages"
      profileBase="/m/profile"
      archiveState={thread.archiveState}
      hiddenAt={thread.hiddenAt}
      departAt={thread.context.kind === "missing" ? null : thread.context.departAt}
    />
  );
}
