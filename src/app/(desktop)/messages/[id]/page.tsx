import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { MessageThread } from "@/components/message-thread";
import type { Message } from "@/lib/types";
import { loadThreadSummaries, newestThreadMessages } from "@/lib/messages";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { queryDemoThreadSummaries, queryDemoThreads } from "@/lib/demo/queries";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getCurrentUser();
  if (!user) redirect("/");
  const demo = await getDemoRuntime();
  if (demo) {
    const thread = queryDemoThreadSummaries(demo.state, user.id).find((item) => item.id === id);
    const source = queryDemoThreads(demo.state, user.id).find((item) => item.conversation.id === id);
    if (!thread || !source) notFound();
    return (
      <MessageThread
        key={`${id}:${demo.revision}`}
        conversationId={id}
        currentUserId={user.id}
        other={thread.other}
        initialMessages={newestThreadMessages(source.messages)}
        archiveState={thread.archiveState}
        hiddenAt={thread.hiddenAt}
        departAt={thread.context.kind === "missing" ? null : thread.context.departAt}
        contextKind={thread.context.kind}
        contextId={thread.context.id}
      />
    );
  }
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
  if (!thread) redirect("/messages");

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
      archiveState={thread.archiveState}
      hiddenAt={thread.hiddenAt}
      departAt={thread.context.kind === "missing" ? null : thread.context.departAt}
      contextKind={thread.context.kind}
      contextId={thread.context.id}
    />
  );
}
