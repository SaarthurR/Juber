import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveTimeoutChunk,
  buildThreadSummaries,
  failClosedNotificationState,
  isCurrentCatchUp,
  lifecycleRefreshTarget,
  loadVisibleNotificationIds,
  mergeFullThreadSnapshot,
  mergeMessageWindow,
  messageMatchesRetry,
  newestThreadMessages,
  nextArchiveRefreshDelay,
  replaceThreadSummary,
  seatCancelRefreshTarget,
  type ConversationHide,
  type ThreadContext,
} from "./messages";
import type { Message, Profile } from "./types";

const currentUserId = "user-a";
const otherUserId = "user-b";

function message(
  id: string,
  conversationId: string,
  createdAt: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversation_id: conversationId,
    sender_id: otherUserId,
    body: id,
    created_at: createdAt,
    read_at: null,
    ...overrides,
  };
}

function profile(id: string): Profile {
  return {
    id,
    full_name: id,
    avatar_url: null,
    neighborhood: null,
    instagram: null,
    pronouns: null,
    preferred_contact: null,
    car_make_model: null,
    car_color: null,
    bio: null,
    is_admin: false,
    created_at: "2026-07-10T00:00:00.000Z",
  };
}

function summaries({
  conversationId = "chat-1",
  userId = currentUserId,
  otherId = otherUserId,
  hides = [],
  messages,
  context = {
    kind: "ride",
    id: "ride-1",
    status: "active",
    departAt: "2026-07-11T12:00:00.000Z",
    passengerStatus: "confirmed",
  },
  unread,
}: {
  conversationId?: string;
  userId?: string;
  otherId?: string;
  hides?: ConversationHide[];
  messages: Message[];
  context?: ThreadContext;
  unread?: number;
}) {
  const sorted = [...messages].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  return buildThreadSummaries({
    memberships: [{ conversation_id: conversationId, user_id: userId }],
    hides,
    others: [{ conversation_id: conversationId, user: profile(otherId) }],
    aggregates: [{
      conversation_id: conversationId,
      last: sorted[0] ?? null,
      unread:
        unread ??
        messages.filter((item) => item.sender_id !== userId && item.read_at === null).length,
    }],
    contexts: [{ conversation_id: conversationId, context }],
    userId,
    now: "2026-07-11T10:00:00.000Z",
  });
}

test("hide lookup is scoped to the current user", () => {
  const messages = [message("old", "chat-1", "2026-07-11T09:00:00.000Z")];
  const peerHide = {
    conversation_id: "chat-1",
    user_id: otherUserId,
    hidden_at: "2026-07-11T09:30:00.000Z",
  };
  const ownHide = { ...peerHide, user_id: currentUserId };

  assert.equal(summaries({ hides: [peerHide], messages }).length, 1);
  assert.equal(summaries({ hides: [ownHide], messages }).length, 0);
});

test("pre-hide messages are excluded from summary and unread", () => {
  const [thread] = summaries({
    hides: [{
      conversation_id: "chat-1",
      user_id: currentUserId,
      hidden_at: "2026-07-11T09:30:00.000Z",
    }],
    messages: [
      message("pre-hide", "chat-1", "2026-07-11T09:00:00.000Z"),
      message("post-hide", "chat-1", "2026-07-11T10:00:00.000Z", {
        sender_id: currentUserId,
      }),
    ],
    unread: 0,
  });

  assert.equal(thread?.last?.id, "post-hide");
  assert.equal(thread?.unread, 0);
});

test("first post-hide inbound message resurrects with unread one", () => {
  const [thread] = summaries({
    hides: [{
      conversation_id: "chat-1",
      user_id: currentUserId,
      hidden_at: "2026-07-11T09:30:00.000Z",
    }],
    messages: [
      message("pre-hide", "chat-1", "2026-07-11T09:00:00.000Z"),
      message("post-hide", "chat-1", "2026-07-11T10:00:00.000Z"),
    ],
    unread: 1,
  });

  assert.equal(thread?.last?.id, "post-hide");
  assert.equal(thread?.unread, 1);
});

test("active confirmed future ride stays active", () => {
  const [thread] = summaries({
    messages: [],
    context: {
      kind: "ride",
      id: "ride-1",
      status: "active",
      departAt: "2026-07-11T12:00:00.000Z",
      passengerStatus: "confirmed",
    },
  });

  assert.equal(thread?.archiveState, "active");
});

test("completed ride is archived", () => {
  const [thread] = summaries({
    messages: [],
    context: {
      kind: "ride",
      id: "ride-1",
      status: "completed",
      departAt: "2026-07-11T12:00:00.000Z",
      passengerStatus: "confirmed",
    },
  });

  assert.equal(thread?.archiveState, "archived");
});

test("cancelled ride is archived", () => {
  const [thread] = summaries({
    messages: [],
    context: {
      kind: "ride",
      id: "ride-1",
      status: "cancelled",
      departAt: "2026-07-11T12:00:00.000Z",
      passengerStatus: "confirmed",
    },
  });

  assert.equal(thread?.archiveState, "archived");
});

test("elapsed active ride is archived", () => {
  const [thread] = summaries({
    messages: [],
    context: {
      kind: "ride",
      id: "ride-1",
      status: "active",
      departAt: "2026-07-11T09:59:59.000Z",
      passengerStatus: "confirmed",
    },
  });

  assert.equal(thread?.archiveState, "archived");
});

test("seat-cancelled ride is archived", () => {
  const [thread] = summaries({
    messages: [],
    context: {
      kind: "ride",
      id: "ride-1",
      status: "active",
      departAt: "2026-07-11T12:00:00.000Z",
      passengerStatus: "cancelled",
    },
  });

  assert.equal(thread?.archiveState, "archived");
});

test("future fulfilled request stays active", () => {
  const [thread] = summaries({
    messages: [],
    context: {
      kind: "request",
      id: "request-1",
      status: "fulfilled",
      departAt: "2026-07-11T12:00:00.000Z",
    },
  });

  assert.equal(thread?.archiveState, "active");
});

test("elapsed fulfilled request is archived", () => {
  const [thread] = summaries({
    messages: [],
    context: {
      kind: "request",
      id: "request-1",
      status: "fulfilled",
      departAt: "2026-07-11T09:59:59.000Z",
    },
  });

  assert.equal(thread?.archiveState, "archived");
});

test("missing context is archived", () => {
  const [thread] = summaries({
    messages: [],
    context: { kind: "missing", id: "missing-1" },
  });

  assert.equal(thread?.archiveState, "archived");
});

test("thread window keeps the newest 50 messages in ascending display order", () => {
  const messages = Array.from({ length: 60 }, (_, index) => {
    const number = index + 1;
    return message(
      `message-${number}`,
      "chat-1",
      new Date(Date.UTC(2026, 6, 11, 10, 0, number)).toISOString(),
    );
  }).reverse();

  const windowed = newestThreadMessages(messages);

  assert.equal(windowed.length, 50);
  assert.equal(windowed[0]?.id, "message-11");
  assert.equal(windowed.at(-1)?.id, "message-60");
});

test("timestamp ordering compares instants rather than serialized strings", () => {
  const earlier = message("earlier", "chat-1", "2026-07-11T10:00:00+02:00");
  const later = message("later", "chat-1", "2026-07-11T08:30:00.000Z");

  assert.deepEqual(
    newestThreadMessages([earlier, later]).map((item) => item.id),
    ["earlier", "later"],
  );
});

test("canonical context key is independent of participant order", () => {
  const [fromA] = summaries({ messages: [] });
  const [fromB] = summaries({
    userId: otherUserId,
    otherId: currentUserId,
    messages: [],
  });

  assert.equal(fromA?.contextKey, "ride:ride-1:user-a:user-b");
  assert.equal(fromA?.contextKey, fromB?.contextKey);
});

test("bounded catch-up merges missed messages and confirms matching pending id", () => {
  const pending = message("pending-id", "chat-1", "2026-07-11T10:02:00.000Z", {
    sender_id: currentUserId,
  });
  const confirmed = { ...pending, body: "confirmed" };
  const missed = message("missed", "chat-1", "2026-07-11T10:01:00.000Z");

  const result = mergeMessageWindow(
    [message("initial", "chat-1", "2026-07-11T10:00:00.000Z"), pending],
    [missed, confirmed],
    pending.id,
  );

  assert.deepEqual(result.messages.map((item) => item.id), ["initial", "missed", "pending-id"]);
  assert.equal(result.messages.at(-1)?.body, "confirmed");
  assert.equal(result.pendingConfirmed, true);
});

test("next archive refresh targets the nearest active departure", () => {
  const later = summaries({
    conversationId: "chat-later",
    messages: [],
    context: {
      kind: "ride",
      id: "ride-later",
      status: "active",
      departAt: "2026-07-11T12:00:00.000Z",
      passengerStatus: "confirmed",
    },
  })[0];
  const sooner = summaries({
    conversationId: "chat-sooner",
    messages: [],
    context: {
      kind: "request",
      id: "request-sooner",
      status: "fulfilled",
      departAt: "2026-07-11T11:00:00.000Z",
    },
  })[0];

  assert.equal(
    nextArchiveRefreshDelay([later, sooner], "2026-07-11T10:00:00.000Z"),
    3_600_000,
  );
});

test("duplicate send readback must match id, conversation, sender, and body", () => {
  const existing = message("message-id", "chat-1", "2026-07-11T10:00:00.000Z", {
    sender_id: currentUserId,
    body: "hello",
  });

  assert.equal(messageMatchesRetry(existing, existing), true);
  assert.equal(messageMatchesRetry(existing, { ...existing, body: "tampered" }), false);
  assert.equal(
    messageMatchesRetry(existing, { ...existing, conversation_id: "chat-2" }),
    false,
  );
});

test("notification visibility errors fail closed without throwing", async () => {
  const result = await loadVisibleNotificationIds(
    {
      rpc: async () => ({ data: null, error: { message: "offline" } }),
    } as unknown as Parameters<typeof loadVisibleNotificationIds>[0],
    6,
    false,
  );

  assert.deepEqual(result.ids, []);
  assert.equal(result.error, "Could not load notification visibility.");
});

test("stale catch-up cannot clear an existing read timestamp", () => {
  const current = message("same", "chat-1", "2026-07-11T10:00:00.000Z", {
    read_at: "2026-07-11T10:05:00.000Z",
  });
  const stale = { ...current, read_at: null };

  const result = mergeMessageWindow([current], [stale], null);

  assert.equal(result.messages[0]?.read_at, current.read_at);
});

test("authoritative thread snapshots stay exact across event overlap", () => {
  const [initial] = summaries({ messages: [], unread: 0 });
  const [snapshot] = summaries({
    messages: [message("new", "chat-1", "2026-07-11T10:01:00.000Z")],
    unread: 1,
  });

  const first = replaceThreadSummary([initial], snapshot);
  const eventAfterSnapshot = replaceThreadSummary(first, snapshot);

  assert.equal(first[0]?.unread, 1);
  assert.equal(eventAfterSnapshot[0]?.unread, 1);
});

test("only the latest catch-up generation may apply", () => {
  assert.equal(isCurrentCatchUp(2, 2), true);
  assert.equal(isCurrentCatchUp(1, 2), false);
});

test("notification detail failure clears stale state", () => {
  const result = failClosedNotificationState<{ id: string }>(
    "Could not refresh notifications.",
  );

  assert.deepEqual(result.items, []);
  assert.equal(result.unread, 0);
  assert.equal(result.error, "Could not refresh notifications.");
});

test("full and per-conversation refreshes converge in either response order", () => {
  const [a0] = summaries({ conversationId: "a", messages: [], unread: 0 });
  const [b0] = summaries({ conversationId: "b", messages: [], unread: 0 });
  const [a1] = summaries({
    conversationId: "a",
    messages: [message("a-new", "a", "2026-07-11T10:01:00.000Z")],
    unread: 1,
  });
  const [b1] = summaries({
    conversationId: "b",
    messages: [message("b-new", "b", "2026-07-11T10:02:00.000Z")],
    unread: 1,
  });
  const started = new Map([["a", 0], ["b", 0]]);
  const current = new Map([["a", 1], ["b", 1]]);

  for (const order of [[a1, b1], [b1, a1]]) {
    let targeted = [a0, b0];
    for (const summary of order) {
      targeted = replaceThreadSummary(targeted, summary);
    }
    const result = mergeFullThreadSnapshot(targeted, [a0, b0], started, current);
    const byId = new Map(result.map((thread) => [thread.id, thread]));
    assert.equal(byId.get("a")?.last?.id, "a-new");
    assert.equal(byId.get("b")?.last?.id, "b-new");
    assert.equal(byId.get("a")?.unread, 1);
    assert.equal(byId.get("b")?.unread, 1);
  }
});

test("lifecycle refresh target selects only the thread context table", () => {
  assert.deepEqual(lifecycleRefreshTarget("ride", "ride-1"), {
    table: "rides",
    filter: "id=eq.ride-1",
  });
  assert.deepEqual(lifecycleRefreshTarget("request", "request-1"), {
    table: "ride_requests",
    filter: "id=eq.request-1",
  });
  assert.equal(lifecycleRefreshTarget("missing", "missing-1"), null);
});

test("seat cancel refresh targets ride_passengers UPDATE on the open ride thread", () => {
  assert.deepEqual(seatCancelRefreshTarget("ride", "ride-1"), {
    table: "ride_passengers",
    filter: "ride_id=eq.ride-1",
  });
  assert.equal(seatCancelRefreshTarget("request", "request-1"), null);
});

test("archive timer chunks long delays until the real boundary", () => {
  const max = 1_000;

  assert.deepEqual(archiveTimeoutChunk(2_100, max), {
    delay: 1_000,
    refreshAtEnd: false,
  });
  assert.deepEqual(archiveTimeoutChunk(1_100, max), {
    delay: 1_000,
    refreshAtEnd: false,
  });
  assert.deepEqual(archiveTimeoutChunk(100, max), {
    delay: 150,
    refreshAtEnd: true,
  });
});
