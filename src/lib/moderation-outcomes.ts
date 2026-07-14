import type { ModerationSnapshot, ModerationWarning } from "@/lib/moderation";

export function unacknowledgedModerationWarnings(
  snapshot: ModerationSnapshot,
): ModerationWarning[] {
  return snapshot.warnings.filter((warning) => warning.acknowledgedAt === null);
}

type OutcomeRealtimeFilter = {
  event: "INSERT";
  schema: "public";
  table: "moderation_outcomes";
  filter: string;
};

type OutcomeRealtimeChannel<TChannel> = {
  on(
    kind: "postgres_changes",
    filter: OutcomeRealtimeFilter,
    callback: () => void,
  ): TChannel;
  subscribe(callback: (status: string) => void): TChannel;
};

type OutcomeRealtimeClient<TChannel> = {
  channel(name: string): TChannel;
  removeChannel(channel: TChannel): unknown;
};

export function subscribeToModerationOutcomes<
  TChannel extends OutcomeRealtimeChannel<TChannel>,
>(
  client: OutcomeRealtimeClient<TChannel>,
  userId: string,
  onInsert: () => void,
  onSubscribed: () => void,
): () => void {
  const channel = client
    .channel(`moderation-outcomes:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "moderation_outcomes",
        filter: `recipient_id=eq.${userId}`,
      },
      onInsert,
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onSubscribed();
    });

  return () => {
    void client.removeChannel(channel);
  };
}
