import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_MODERATION_SNAPSHOT,
  parseModerationNotices,
  type ModerationSnapshot,
} from "./moderation";
import {
  subscribeToModerationOutcomes,
  unacknowledgedModerationWarnings,
} from "./moderation-outcomes";

test("member snapshot keeps only the frozen self-outcome DTO", () => {
  const snapshot = parseModerationNotices({
    banned: false,
    ban: null,
    has_pending_appeal: false,
    appeal: null,
    warnings: [{
      id: "warning-1",
      note: "Follow the community guidelines.",
      created_at: "2026-07-13T10:00:00.000Z",
      outcome_id: "outcome-1",
      acknowledged_at: null,
      reporter_id: "must-not-pass",
      evidence: "must-not-pass",
    }],
    outcomes: [{
      id: "outcome-1",
      type: "warning",
      source_action_id: "action-1",
      acknowledged_at: null,
      created_at: "2026-07-13T10:00:00.000Z",
      report_id: "must-not-pass",
      actor_id: "must-not-pass",
      allegation: "must-not-pass",
      member_reason: "must-not-pass-for-warning",
    }, {
      id: "outcome-2",
      type: "unban",
      source_action_id: "action-2",
      acknowledged_at: null,
      created_at: "2026-07-13T11:00:00.000Z",
      member_reason: "The suspension was applied in error.",
    }],
    outcome_cursor: { id: "outcome-1", created_at: "2026-07-13T10:00:00.000Z" },
  });

  assert.deepEqual(snapshot.warnings, [{
    id: "warning-1",
    note: "Follow the community guidelines.",
    created_at: "2026-07-13T10:00:00.000Z",
    outcomeId: "outcome-1",
    acknowledgedAt: null,
  }]);
  assert.deepEqual(snapshot.outcomes, [{
    id: "outcome-1",
    type: "warning",
    sourceActionId: "action-1",
    acknowledgedAt: null,
    createdAt: "2026-07-13T10:00:00.000Z",
    memberReason: null,
  }, {
    id: "outcome-2",
    type: "unban",
    sourceActionId: "action-2",
    acknowledgedAt: null,
    createdAt: "2026-07-13T11:00:00.000Z",
    memberReason: "The suspension was applied in error.",
  }]);
  assert.doesNotMatch(JSON.stringify(snapshot), /reporter|report_id|evidence|actor|allegation/);
});

test("warning reconciliation drops durable acknowledgements", () => {
  const acknowledged = snapshotWithWarning("outcome-1", "2026-07-13T11:00:00.000Z");

  assert.equal(unacknowledgedModerationWarnings(acknowledged).length, 0);
});

test("outcome subscription listens to recipient INSERT only and closes the render race", () => {
  let insertSignals = 0;
  let subscribedSignals = 0;
  let removed = false;
  let registeredEvent = "";
  let registeredFilter = "";
  let insertCallback: (() => void) | null = null;

  const channel = {
    on(
      _kind: "postgres_changes",
      filter: { event: "INSERT"; schema: "public"; table: "moderation_outcomes"; filter: string },
      callback: () => void,
    ) {
      registeredEvent = filter.event;
      registeredFilter = filter.filter;
      insertCallback = callback;
      return this;
    },
    subscribe(callback: (status: string) => void) {
      insertCallback?.();
      callback("SUBSCRIBED");
      return this;
    },
  };
  const client = {
    channel() {
      return channel;
    },
    removeChannel() {
      removed = true;
    },
  };

  const unsubscribe = subscribeToModerationOutcomes(
    client,
    "member-1",
    () => { insertSignals += 1; },
    () => { subscribedSignals += 1; },
  );

  assert.equal(registeredEvent, "INSERT");
  assert.equal(registeredFilter, "recipient_id=eq.member-1");
  assert.equal(insertSignals, 1, "an insert during subscribe must still reconcile");
  assert.equal(subscribedSignals, 1, "initial connect and reconnect use snapshot reconciliation");
  unsubscribe();
  assert.equal(removed, true);
});

test("root lifecycle owns warning acknowledgement, reconnect, visibility, and multi-tab recovery", () => {
  const provider = read("../components/moderation-state-provider.tsx");
  const gate = read("../components/moderation-banned-gate.tsx");
  const banned = read("../components/banned-status-page.tsx");
  const warning = read("../components/moderation-warning-outcome.tsx");
  const action = read("../app/moderation/outcome-actions.ts");
  const root = read("../app/layout.tsx");

  assert.ok(
    provider.indexOf("const unsubscribe = subscribeToModerationOutcomes")
      < provider.indexOf("queueMicrotask(() => void reconcileFrom())"),
    "subscribe must be installed before mount reconciliation",
  );
  assert.match(provider, /visibilityState === "visible"/);
  assert.match(provider, /BroadcastChannel/);
  assert.match(provider, /useState<string \| null>\(null\)/);
  assert.match(provider, /onReview=\{\(\) => setReviewOutcomeId/);
  assert.doesNotMatch(provider, /initialWarning\?\.outcomeId|nextWarnings\[0\]\?\.outcomeId/);
  assert.match(provider, /snapshot\.banned \? \[\] : unacknowledgedModerationWarnings/);
  assert.match(provider, /recoveryOutcome\.memberReason/);
  assert.match(provider, /inert=\{blockingOutcome \? true : undefined\}/);
  assert.match(warning, /role="dialog"/);
  assert.match(warning, /aria-modal="true"/);
  assert.match(warning, />Reason</);
  assert.match(warning, />Restrictions</);
  assert.match(warning, /"I understand"/);
  assert.match(warning, /role="status"/);
  assert.match(warning, /Review warning/);
  assert.doesNotMatch(warning, /report id|reporter|evidence|allegation/i);
  assert.match(gate, /<BannedStatusView/);
  assert.match(gate, /appeal_denied/);
  assert.match(gate, /acknowledge\(unacknowledgedOutcome\.id\)/);
  assert.doesNotMatch(gate, /Dismiss|Escape|backdrop/i);
  assert.match(banned, /Acknowledge notice/);
  assert.match(banned, /You may submit another appeal/);
  assert.match(banned, /Only one appeal can be pending at a time/);
  assert.match(action, /rpc\("acknowledge_moderation_outcome"/);
  assert.match(action, /getAuthUser/);
  assert.ok(root.indexOf("<ModerationStateProvider") < root.indexOf("<ModerationBannedGate"));
});

function snapshotWithWarning(
  outcomeId: string,
  acknowledgedAt: string | null,
): ModerationSnapshot {
  return {
    ...EMPTY_MODERATION_SNAPSHOT,
    warnings: [{
      id: `warning-${outcomeId}`,
      note: "Follow the community guidelines.",
      created_at: "2026-07-13T10:00:00.000Z",
      outcomeId,
      acknowledgedAt,
    }],
  };
}

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}
