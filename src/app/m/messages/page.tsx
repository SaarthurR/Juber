import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { SubHeader } from "@/components/mobile/sub-header";
import { MessagesList } from "@/components/messages-list";
import { loadThreadSummaries } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Mobile inbox. Mirrors the desktop /messages list but stays inside the /m
// phone shell so the bottom nav / chrome is consistent, and links each thread
// to /m/messages/[id] instead of the desktop route.
export default async function MobileMessagesPage() {
  const { user } = await getCurrentUser();
  if (!user) redirect("/m");
  const supabase = await createClient();
  const threads = await loadThreadSummaries(supabase, user.id);

  return (
    <div className="pb-28">
      <SubHeader
        title="Messages"
        pill={threads.length ? `${threads.length}` : undefined}
        backFallback="/m"
      />
      <div className="px-4 pt-1">
        <MessagesList userId={user.id} initialThreads={threads} basePath="/m/messages" />
      </div>
    </div>
  );
}
