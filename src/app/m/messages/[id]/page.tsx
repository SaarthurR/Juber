import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { MessageThread } from "@/components/message-thread";
import type { Message, Profile } from "@/lib/types";

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

  // RLS ensures we only get the convo if we're a participant.
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id, user:profiles!conversation_participants_user_id_fkey(*)")
    .eq("conversation_id", id);

  if (!participants || !participants.some((p) => p.user_id === user.id)) {
    notFound();
  }

  const other =
    (participants.find((p) => p.user_id !== user.id)?.user as unknown as Profile) ?? null;

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  return (
    <MessageThread
      conversationId={id}
      currentUserId={user.id}
      other={other}
      initialMessages={(messages as Message[]) ?? []}
      backHref="/m/messages"
    />
  );
}
