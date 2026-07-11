import test from "node:test";
import assert from "node:assert/strict";
import {
  buildThreadSummaries,
  newestThreadMessages,
  type ConversationMembership,
  type ConversationProfile,
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
  memberships,
  messages,
}: {
  memberships: ConversationMembership[];
  messages: Message[];
}) {
  const others: ConversationProfile[] = memberships.map((membership) => ({
    conversation_id: membership.conversation_id,
    user: profile(otherUserId),
  }));
  return buildThreadSummaries({ memberships, others, messages, userId: currentUserId });
}

test("hidden conversations resurrect only after a post-hide message", () => {
  const memberships = [
    { conversation_id: "hidden-only-old", hidden_at: "2026-07-10T10:00:00.000Z" },
    { conversation_id: "hidden-with-new", hidden_at: "2026-07-10T10:00:00.000Z" },
    { conversation_id: "never-hidden", hidden_at: null },
  ];

  assert.deepEqual(
    summaries({
      memberships,
      messages: [
        message("old", "hidden-only-old", "2026-07-10T09:59:00.000Z"),
        message("new", "hidden-with-new", "2026-07-10T10:01:00.000Z"),
      ],
    }).map((thread) => thread.id),
    ["hidden-with-new", "never-hidden"],
  );
});

test("unread counts include only inbound messages after hidden_at", () => {
  const [thread] = summaries({
    memberships: [{ conversation_id: "chat-1", hidden_at: "2026-07-10T10:00:00.000Z" }],
    messages: [
      message("pre-hide-unread", "chat-1", "2026-07-10T09:59:00.000Z"),
      message("post-hide-read", "chat-1", "2026-07-10T10:01:00.000Z", {
        read_at: "2026-07-10T10:02:00.000Z",
      }),
      message("post-hide-outbound", "chat-1", "2026-07-10T10:03:00.000Z", {
        sender_id: currentUserId,
      }),
      message("post-hide-unread", "chat-1", "2026-07-10T10:04:00.000Z"),
    ],
  });

  assert.equal(thread?.unread, 1);
});

test("thread window keeps the newest 50 messages in ascending display order", () => {
  const messages = Array.from({ length: 60 }, (_, index) => {
    const number = index + 1;
    return message(
      `message-${number}`,
      "chat-1",
      `2026-07-10T10:${String(number).padStart(2, "0")}:00.000Z`,
    );
  });

  const windowed = newestThreadMessages(messages);

  assert.equal(windowed.length, 50);
  assert.equal(windowed[0]?.id, "message-11");
  assert.equal(windowed.at(-1)?.id, "message-60");
});

test("thread summaries select the canonical newest message independent of input order", () => {
  const [thread] = summaries({
    memberships: [{ conversation_id: "chat-1", hidden_at: null }],
    messages: [
      message("older", "chat-1", "2026-07-10T10:00:00.000Z"),
      message("newer", "chat-1", "2026-07-10T10:05:00.000Z"),
      message("middle", "chat-1", "2026-07-10T10:03:00.000Z"),
    ],
  });

  assert.equal(thread?.last?.id, "newer");
});
