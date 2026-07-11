import test from "node:test";
import assert from "node:assert/strict";
import {
  buildThreadSummaries,
  newestThreadMessages,
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
