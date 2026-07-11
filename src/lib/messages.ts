import type { Message, Profile } from "@/lib/types";

export type ConversationMembership = {
  conversation_id: string;
  hidden_at: string | null;
};

export type ConversationProfile = {
  conversation_id: string;
  user: Profile | null;
};

export type ThreadSummary = {
  id: string;
  other: Profile | null;
  last: Message | null;
  unread: number;
  hiddenAt: string | null;
};

export function buildThreadSummaries({
  memberships,
  others,
  messages,
  userId,
}: {
  memberships: ConversationMembership[];
  others: ConversationProfile[];
  messages: Message[];
  userId: string;
}): ThreadSummary[] {
  const threads = memberships.flatMap((membership) => {
    const inThread = messages
      .filter((message) => message.conversation_id === membership.conversation_id)
      .sort(compareMessagesNewestFirst);
    const visibleMessages = inThread.filter((message) => isAfterHidden(message, membership.hidden_at));
    if (membership.hidden_at !== null && visibleMessages.length === 0) return [];

    return {
      id: membership.conversation_id,
      other: others.find((other) => other.conversation_id === membership.conversation_id)?.user ?? null,
      last: visibleMessages[0] ?? null,
      unread: visibleMessages.filter((message) => message.sender_id !== userId && !message.read_at).length,
      hiddenAt: membership.hidden_at,
    };
  });

  threads.sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
  return threads;
}

export function newestThreadMessages(messages: Message[], limit = 50): Message[] {
  return [...messages].sort(compareMessagesNewestFirst).slice(0, limit).reverse();
}

export function isAfterHidden(message: Message, hiddenAt: string | null): boolean {
  return hiddenAt === null || message.created_at > hiddenAt;
}

function compareMessagesNewestFirst(a: Message, b: Message): number {
  const created = b.created_at.localeCompare(a.created_at);
  if (created !== 0) return created;
  return b.id.localeCompare(a.id);
}
