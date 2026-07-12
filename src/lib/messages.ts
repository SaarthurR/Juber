import type { Message, Profile } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationMembership = {
  conversation_id: string;
  user_id: string;
};

export type ConversationHide = {
  conversation_id: string;
  user_id: string;
  hidden_at: string;
};

export type ConversationProfile = {
  conversation_id: string;
  user: Profile | null;
};

export type ThreadContext =
  | {
      kind: "ride";
      id: string;
      status: "active" | "completed" | "cancelled";
      departAt: string;
      passengerStatus: "pending" | "confirmed" | "declined" | "cancelled" | null;
    }
  | {
      kind: "request";
      id: string;
      status: "active" | "fulfilled" | "cancelled";
      departAt: string;
    }
  | {
      kind: "missing";
      id: string;
    };

export type ThreadAggregate = {
  conversation_id: string;
  last: Message | null;
  unread: number;
};

export type ThreadSummary = {
  id: string;
  other: Profile | null;
  last: Message | null;
  unread: number;
  hiddenAt: string | null;
  context: ThreadContext;
  contextKey: string;
  archiveState: "active" | "archived";
};

export type VisibleNotificationIdsResult = {
  ids: string[];
  error: string | null;
};

type ConversationRow = {
  id: string;
  ride_id: string | null;
  request_id: string | null;
};

type RideContextRow = {
  id: string;
  driver_id: string;
  status: "active" | "completed" | "cancelled";
  depart_at: string;
};

type PassengerContextRow = {
  ride_id: string;
  passenger_id: string;
  status: "pending" | "confirmed" | "declined" | "cancelled";
};

type RequestContextRow = {
  id: string;
  status: "active" | "fulfilled" | "cancelled";
  depart_at: string;
};

type MessageSummaryRow = {
  conversation_id: string;
  last_message_id: string | null;
  last_sender_id: string | null;
  last_body: string | null;
  last_created_at: string | null;
  last_read_at: string | null;
  unread_count: number | string;
};

export function buildThreadSummaries({
  memberships,
  hides,
  others,
  aggregates,
  contexts,
  userId,
  now,
}: {
  memberships: ConversationMembership[];
  hides: ConversationHide[];
  others: ConversationProfile[];
  aggregates: ThreadAggregate[];
  contexts: Array<{ conversation_id: string; context: ThreadContext }>;
  userId: string;
  now: string;
}): ThreadSummary[] {
  const threads = memberships.flatMap((membership) => {
    const hide = conversationHideFor(hides, membership.conversation_id, userId);
    const aggregate =
      aggregates.find((row) => row.conversation_id === membership.conversation_id) ?? null;
    const last = aggregate?.last ?? null;
    if (hide && (!last || !isAfterHidden(last, hide.hidden_at))) return [];
    const other =
      others.find((row) => row.conversation_id === membership.conversation_id)?.user ?? null;
    const context =
      contexts.find((row) => row.conversation_id === membership.conversation_id)?.context ?? {
        kind: "missing" as const,
        id: membership.conversation_id,
      };

    return {
      id: membership.conversation_id,
      other,
      last,
      unread: aggregate?.unread ?? 0,
      hiddenAt: hide?.hidden_at ?? null,
      context,
      contextKey: canonicalContextKey(
        context.kind,
        context.id,
        userId,
        other?.id ?? userId,
      ),
      archiveState: classifyArchiveState(context, now),
    };
  });

  return sortThreadSummaries(threads);
}

export async function loadThreadSummaries(
  supabase: SupabaseClient,
  userId: string,
  conversationId?: string,
): Promise<ThreadSummary[]> {
  let membershipQuery = supabase
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .eq("user_id", userId);
  if (conversationId) {
    membershipQuery = membershipQuery.eq("conversation_id", conversationId);
  }
  const membershipResult = await membershipQuery;
  if (membershipResult.error) throw new Error("Could not load conversation memberships.");

  const memberships = (membershipResult.data ?? []) as ConversationMembership[];
  const conversationIds = memberships.map((row) => row.conversation_id);
  if (conversationIds.length === 0) return [];

  const [hideResult, otherResult, conversationResult, summaryResult] = await Promise.all([
    supabase
      .from("conversation_hides")
      .select("conversation_id, user_id, hidden_at")
      .eq("user_id", userId)
      .in("conversation_id", conversationIds),
    supabase
      .from("conversation_participants")
      .select("conversation_id, user:profiles!conversation_participants_user_id_fkey(*)")
      .in("conversation_id", conversationIds)
      .neq("user_id", userId),
    supabase
      .from("conversations")
      .select("id, ride_id, request_id")
      .in("id", conversationIds),
    supabase.rpc("conversation_message_summaries", {
      p_conversation_ids: conversationIds,
    }),
  ]);

  if (hideResult.error) throw new Error("Could not load private conversation state.");
  if (otherResult.error) throw new Error("Could not load conversation profiles.");
  if (conversationResult.error) throw new Error("Could not load conversation context.");
  if (summaryResult.error) throw new Error("Could not load message summaries.");

  const conversations = (conversationResult.data ?? []) as ConversationRow[];
  const rideIds = conversations.flatMap((row) => (row.ride_id ? [row.ride_id] : []));
  const requestIds = conversations.flatMap((row) => (row.request_id ? [row.request_id] : []));
  const [rides, passengers, requests] = await Promise.all([
    rideIds.length
      ? supabase
          .from("rides")
          .select("id, driver_id, status, depart_at")
          .in("id", rideIds)
      : Promise.resolve({ data: [] as RideContextRow[], error: null }),
    rideIds.length
      ? supabase
          .from("ride_passengers")
          .select("ride_id, passenger_id, status")
          .in("ride_id", rideIds)
      : Promise.resolve({ data: [] as PassengerContextRow[], error: null }),
    requestIds.length
      ? supabase
          .from("ride_requests")
          .select("id, status, depart_at")
          .in("id", requestIds)
      : Promise.resolve({ data: [] as RequestContextRow[], error: null }),
  ]);

  if (rides.error || passengers.error || requests.error) {
    throw new Error("Could not load ride or request context.");
  }

  const others = ((otherResult.data ?? []) as unknown as Array<{
    conversation_id: string;
    user: Profile | null;
  }>);
  const rideRows = (rides.data ?? []) as RideContextRow[];
  const passengerRows = (passengers.data ?? []) as PassengerContextRow[];
  const requestRows = (requests.data ?? []) as RequestContextRow[];
  const contexts = conversations.map((conversation) => {
    if (conversation.ride_id) {
      const ride = rideRows.find((row) => row.id === conversation.ride_id);
      const other = others.find((row) => row.conversation_id === conversation.id)?.user ?? null;
      const passengerId = ride?.driver_id === userId ? other?.id : userId;
      const passenger =
        passengerRows.find(
          (row) =>
            row.ride_id === conversation.ride_id &&
            row.passenger_id === passengerId,
        ) ?? null;
      return {
        conversation_id: conversation.id,
        context: ride
          ? {
              kind: "ride" as const,
              id: ride.id,
              status: ride.status,
              departAt: ride.depart_at,
              passengerStatus: passenger?.status ?? null,
            }
          : { kind: "missing" as const, id: conversation.ride_id },
      };
    }
    if (conversation.request_id) {
      const request = requestRows.find((row) => row.id === conversation.request_id);
      return {
        conversation_id: conversation.id,
        context: request
          ? {
              kind: "request" as const,
              id: request.id,
              status: request.status,
              departAt: request.depart_at,
            }
          : { kind: "missing" as const, id: conversation.request_id },
      };
    }
    return {
      conversation_id: conversation.id,
      context: { kind: "missing" as const, id: conversation.id },
    };
  });
  const summaryRows = (summaryResult.data ?? []) as MessageSummaryRow[];
  if (summaryRows.length !== memberships.length) {
    throw new Error("Message summaries were incomplete.");
  }
  const aggregates = summaryRows.map((row) => {
    const unread = Number(row.unread_count);
    if (!Number.isFinite(unread)) throw new Error("Message unread count was invalid.");
    return {
      conversation_id: row.conversation_id,
      last:
        row.last_message_id &&
        row.last_sender_id &&
        row.last_body !== null &&
        row.last_created_at
          ? {
              id: row.last_message_id,
              conversation_id: row.conversation_id,
              sender_id: row.last_sender_id,
              body: row.last_body,
              created_at: row.last_created_at,
              read_at: row.last_read_at,
            }
          : null,
      unread,
    };
  });

  return buildThreadSummaries({
    memberships,
    hides: (hideResult.data ?? []) as ConversationHide[],
    others,
    aggregates,
    contexts,
    userId,
    now: new Date().toISOString(),
  });
}

export async function loadVisibleNotificationIds(
  supabase: SupabaseClient,
  limit: number | null,
  unreadOnly: boolean,
): Promise<VisibleNotificationIdsResult> {
  try {
    const { data, error } = await supabase.rpc("visible_notification_ids", {
      p_limit: limit,
      p_unread_only: unreadOnly,
    });
    if (error) {
      return { ids: [], error: "Could not load notification visibility." };
    }
    return {
      ids: ((data ?? []) as Array<{ id: string }>).map((row) => row.id),
      error: null,
    };
  } catch {
    return { ids: [], error: "Could not load notification visibility." };
  }
}

export function newestThreadMessages(messages: Message[], limit = 50): Message[] {
  return [...messages].sort(compareMessagesNewestFirst).slice(0, limit).reverse();
}

export function mergeMessageWindow(
  current: Message[],
  incoming: Message[],
  pendingId: string | null,
): { messages: Message[]; pendingConfirmed: boolean } {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, {
      ...message,
      read_at: latestReadAt(existing?.read_at ?? null, message.read_at),
    });
  }
  const pendingConfirmed =
    pendingId !== null && incoming.some((message) => message.id === pendingId);
  const pending =
    pendingId && !pendingConfirmed ? byId.get(pendingId) ?? null : null;
  if (pendingId && !pendingConfirmed) byId.delete(pendingId);
  const messages = newestThreadMessages([...byId.values()]);
  return {
    messages: pending ? [...messages, pending] : messages,
    pendingConfirmed,
  };
}

export function replaceThreadSummary(
  threads: ThreadSummary[],
  next: ThreadSummary,
): ThreadSummary[] {
  return sortThreadSummaries([
    next,
    ...threads.filter((thread) => thread.id !== next.id),
  ]);
}

export function mergeFullThreadSnapshot(
  previous: ThreadSummary[],
  full: ThreadSummary[],
  startedVersions: ReadonlyMap<string, number>,
  currentVersions: ReadonlyMap<string, number>,
): ThreadSummary[] {
  const previousById = new Map(previous.map((thread) => [thread.id, thread]));
  const fullById = new Map(full.map((thread) => [thread.id, thread]));
  const ids = new Set([...previousById.keys(), ...fullById.keys()]);
  const merged = [...ids].flatMap((id) => {
    const targetedAdvanced =
      (currentVersions.get(id) ?? 0) > (startedVersions.get(id) ?? 0);
    const thread = targetedAdvanced ? previousById.get(id) : fullById.get(id);
    return thread ? [thread] : [];
  });
  return sortThreadSummaries(merged);
}

export function isCurrentCatchUp(started: number, current: number): boolean {
  return started === current;
}

export function failClosedNotificationState<T>(error: string): {
  items: T[];
  unread: number;
  error: string;
} {
  return { items: [], unread: 0, error };
}

export function nextArchiveRefreshDelay(
  threads: ThreadSummary[],
  now: string,
): number | null {
  const departures = threads.flatMap((thread) => {
    if (thread.archiveState !== "active" || thread.context.kind === "missing") return [];
    const delay = archiveRefreshDelay(thread.context.departAt, thread.archiveState, now);
    return delay === null ? [] : [delay];
  });
  if (departures.length === 0) return null;
  return Math.min(...departures);
}

export function archiveRefreshDelay(
  departAt: string | null,
  archiveState: ThreadSummary["archiveState"],
  now: string,
): number | null {
  if (!departAt || archiveState !== "active") return null;
  return Math.max(0, timestampEpoch(departAt) - timestampEpoch(now));
}

export function lifecycleRefreshTarget(
  kind: ThreadContext["kind"],
  id: string,
): { table: "rides" | "ride_requests"; filter: string } | null {
  if (kind === "ride") return { table: "rides", filter: `id=eq.${id}` };
  if (kind === "request") {
    return { table: "ride_requests", filter: `id=eq.${id}` };
  }
  return null;
}

export function seatCancelRefreshTarget(
  kind: ThreadContext["kind"],
  rideId: string,
): { table: "ride_passengers"; filter: string } | null {
  if (kind !== "ride") return null;
  return { table: "ride_passengers", filter: `ride_id=eq.${rideId}` };
}

export function archiveTimeoutChunk(
  remaining: number,
  maxDelay = 2_147_483_647,
): { delay: number; refreshAtEnd: boolean } {
  if (remaining > maxDelay) {
    return { delay: maxDelay, refreshAtEnd: false };
  }
  return {
    delay: Math.min(Math.max(0, remaining) + 50, maxDelay),
    refreshAtEnd: true,
  };
}

export function messageMatchesRetry(
  existing: Message,
  expected: Pick<Message, "id" | "conversation_id" | "sender_id" | "body">,
): boolean {
  return (
    existing.id === expected.id &&
    existing.conversation_id === expected.conversation_id &&
    existing.sender_id === expected.sender_id &&
    existing.body === expected.body
  );
}

export function conversationHideFor(
  hides: ConversationHide[],
  conversationId: string,
  userId: string,
): ConversationHide | null {
  return (
    hides.find(
      (row) => row.conversation_id === conversationId && row.user_id === userId,
    ) ?? null
  );
}

export function isAfterHidden(
  message: Pick<Message, "created_at"> | string,
  hiddenAt: string | null,
): boolean {
  const createdAt = typeof message === "string" ? message : message.created_at;
  return hiddenAt === null || timestampEpoch(createdAt) > timestampEpoch(hiddenAt);
}

export function sortThreadSummaries(threads: ThreadSummary[]): ThreadSummary[] {
  return [...threads].sort((a, b) => {
    const created =
      timestampEpoch(b.last?.created_at) - timestampEpoch(a.last?.created_at);
    if (created !== 0) return created;
    return a.contextKey.localeCompare(b.contextKey);
  });
}

function classifyArchiveState(
  context: ThreadContext,
  now: string,
): ThreadSummary["archiveState"] {
  if (context.kind === "ride") {
    return context.status === "active" &&
      context.passengerStatus === "confirmed" &&
      timestampEpoch(context.departAt) >= timestampEpoch(now)
      ? "active"
      : "archived";
  }
  if (context.kind === "request") {
    return context.status === "fulfilled" &&
      timestampEpoch(context.departAt) >= timestampEpoch(now)
      ? "active"
      : "archived";
  }
  return "archived";
}

function canonicalContextKey(
  kind: ThreadContext["kind"],
  contextId: string,
  firstUserId: string,
  secondUserId: string,
): string {
  const [first, second] = [firstUserId, secondUserId].sort();
  return `${kind}:${contextId}:${first}:${second}`;
}

function compareMessagesNewestFirst(a: Message, b: Message): number {
  const created = timestampEpoch(b.created_at) - timestampEpoch(a.created_at);
  if (created !== 0) return created;
  return b.id.localeCompare(a.id);
}

function timestampEpoch(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function latestReadAt(current: string | null, incoming: string | null): string | null {
  if (!current) return incoming;
  if (!incoming) return current;
  return timestampEpoch(incoming) > timestampEpoch(current) ? incoming : current;
}
