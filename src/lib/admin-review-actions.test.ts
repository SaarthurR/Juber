import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_ACTION_INITIAL } from "./admin-action-state";
import { createAdminReviewActions } from "./admin-review-actions";

type DatabaseError = { message: string } | null;
type DeleteResult = { data: { id: string } | null; error: DatabaseError };
type RpcResult = { data: unknown; error: DatabaseError };

function deleteClient(result: DeleteResult, calls: string[]) {
  const query = {
    delete() {
      calls.push("delete");
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push(`eq:${column}:${String(value)}`);
      return query;
    },
    select(columns: string) {
      calls.push(`select:${columns}`);
      return query;
    },
    async maybeSingle() {
      calls.push("maybeSingle");
      return result;
    },
  };

  return {
    from(table: string) {
      calls.push(`from:${table}`);
      return query;
    },
    async rpc() {
      throw new Error("delete action must not call rpc");
    },
  };
}

function approvalClient(result: RpcResult, calls: string[]) {
  return {
    from(table: string) {
      throw new Error(`approval action must not read ${table}`);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(`rpc:${name}:${String(args.p_request_id)}`);
      return result;
    },
  };
}

const deleteCases = [
  {
    name: "event",
    table: "events",
    id: "event-1",
    method: "deleteEvent" as const,
    success: "Event deleted.",
    stale: "Event was already deleted.",
    revalidated: ["/admin", "/events", "/m/events"],
  },
  {
    name: "place",
    table: "places",
    id: "place-1",
    method: "deletePlace" as const,
    success: "Location deleted.",
    stale: "Location was already deleted.",
    revalidated: ["/admin"],
  },
  {
    name: "event request",
    table: "event_requests",
    id: "request-1",
    method: "deleteEventRequest" as const,
    success: "Request deleted.",
    stale: "Request was already deleted.",
    revalidated: ["/admin"],
  },
];

for (const deleteCase of deleteCases) {
  test(`${deleteCase.name} delete reports success only for a returned row`, async () => {
    const calls: string[] = [];
    const revalidated: string[] = [];
    let adminChecks = 0;
    const actions = createAdminReviewActions({
      requireAdmin: async () => {
        adminChecks += 1;
        return {
          supabase: deleteClient(
            { data: { id: deleteCase.id }, error: null },
            calls,
          ),
        };
      },
      revalidatePath: (path) => revalidated.push(path),
    });

    const state = await actions[deleteCase.method](deleteCase.id, {
      ...ADMIN_ACTION_INITIAL,
      resetKey: 4,
    });

    assert.deepEqual(state, {
      status: "success",
      message: deleteCase.success,
      resetKey: 5,
    });
    assert.equal(adminChecks, 1);
    assert.deepEqual(calls, [
      `from:${deleteCase.table}`,
      "delete",
      `eq:id:${deleteCase.id}`,
      "select:id",
      "maybeSingle",
    ]);
    assert.deepEqual(revalidated, deleteCase.revalidated);
  });

  test(`${deleteCase.name} delete reports a visible stale outcome`, async () => {
    const calls: string[] = [];
    const revalidated: string[] = [];
    const actions = createAdminReviewActions({
      requireAdmin: async () => ({
        supabase: deleteClient({ data: null, error: null }, calls),
      }),
      revalidatePath: (path) => revalidated.push(path),
    });

    const state = await actions[deleteCase.method](deleteCase.id, {
      ...ADMIN_ACTION_INITIAL,
      resetKey: 4,
    });

    assert.deepEqual(state, {
      status: "info",
      message: deleteCase.stale,
      resetKey: 0,
    });
    assert.deepEqual(calls, [
      `from:${deleteCase.table}`,
      "delete",
      `eq:id:${deleteCase.id}`,
      "select:id",
      "maybeSingle",
    ]);
    assert.deepEqual(revalidated, deleteCase.revalidated);
  });

  test(`${deleteCase.name} delete surfaces database failure without revalidation`, async () => {
    const revalidated: string[] = [];
    const actions = createAdminReviewActions({
      requireAdmin: async () => ({
        supabase: deleteClient(
          { data: null, error: { message: `${deleteCase.name} blocked` } },
          [],
        ),
      }),
      revalidatePath: (path) => revalidated.push(path),
    });

    const state = await actions[deleteCase.method](
      deleteCase.id,
      ADMIN_ACTION_INITIAL,
    );

    assert.deepEqual(state, {
      status: "error",
      message: `${deleteCase.name} blocked`,
      resetKey: 0,
    });
    assert.deepEqual(revalidated, []);
  });
}

test("approval calls only v2 and maps the creator outcome", async () => {
  const calls: string[] = [];
  const revalidated: string[] = [];
  const actions = createAdminReviewActions({
    requireAdmin: async () => ({
      supabase: approvalClient(
        {
          data: { outcome: "approved", event_id: "event-1" },
          error: null,
        },
        calls,
      ),
    }),
    revalidatePath: (path) => revalidated.push(path),
  });

  const state = await actions.approveEventRequest("request-1", {
    ...ADMIN_ACTION_INITIAL,
    resetKey: 2,
  });

  assert.deepEqual(calls, [
    "rpc:approve_event_request_v2:request-1",
  ]);
  assert.deepEqual(state, {
    status: "success",
    message: "Event approved and published.",
    resetKey: 3,
  });
  assert.deepEqual(revalidated, ["/admin", "/events", "/m/events"]);
});

test("approval maps a concurrent loser directly to already-approved info", async () => {
  const revalidated: string[] = [];
  const actions = createAdminReviewActions({
    requireAdmin: async () => ({
      supabase: approvalClient(
        {
          data: { outcome: "already_approved", event_id: "event-1" },
          error: null,
        },
        [],
      ),
    }),
    revalidatePath: (path) => revalidated.push(path),
  });

  const state = await actions.approveEventRequest("request-1", {
    ...ADMIN_ACTION_INITIAL,
    resetKey: 2,
  });

  assert.deepEqual(state, {
    status: "info",
    message: "Request was already approved.",
    resetKey: 0,
  });
  assert.deepEqual(revalidated, ["/admin", "/events", "/m/events"]);
});

test("rejection calls only v2 and maps the fresh reject outcome", async () => {
  const calls: string[] = [];
  const revalidated: string[] = [];
  const actions = createAdminReviewActions({
    requireAdmin: async () => ({
      supabase: approvalClient(
        {
          data: { outcome: "rejected", event_id: null },
          error: null,
        },
        calls,
      ),
    }),
    revalidatePath: (path) => revalidated.push(path),
  });

  const state = await actions.rejectEventRequest("request-1", {
    ...ADMIN_ACTION_INITIAL,
    resetKey: 2,
  });

  assert.deepEqual(calls, ["rpc:reject_event_request_v2:request-1"]);
  assert.deepEqual(state, {
    status: "success",
    message: "Request rejected.",
    resetKey: 3,
  });
  assert.deepEqual(revalidated, ["/admin", "/events", "/m/events"]);
});

for (const outcome of [
  {
    value: "already_rejected",
    message: "Request was already rejected.",
  },
  {
    value: "missing",
    message: "Request not found.",
  },
] as const) {
  test(`approval maps ${outcome.value} without event revalidation`, async () => {
    const revalidated: string[] = [];
    const actions = createAdminReviewActions({
      requireAdmin: async () => ({
        supabase: approvalClient(
          {
            data: { outcome: outcome.value, event_id: null },
            error: null,
          },
          [],
        ),
      }),
      revalidatePath: (path) => revalidated.push(path),
    });

    const state = await actions.approveEventRequest(
      "request-1",
      ADMIN_ACTION_INITIAL,
    );

    assert.deepEqual(state, {
      status: "info",
      message: outcome.message,
      resetKey: 0,
    });
    assert.deepEqual(revalidated, ["/admin"]);
  });
}

test("approval surfaces RPC errors without revalidation", async () => {
  const revalidated: string[] = [];
  const actions = createAdminReviewActions({
    requireAdmin: async () => ({
      supabase: approvalClient(
        {
          data: null,
          error: { message: "Only admins can approve event requests" },
        },
        [],
      ),
    }),
    revalidatePath: (path) => revalidated.push(path),
  });

  const state = await actions.approveEventRequest(
    "request-1",
    ADMIN_ACTION_INITIAL,
  );

  assert.deepEqual(state, {
    status: "error",
    message: "Only admins can approve event requests",
    resetKey: 0,
  });
  assert.deepEqual(revalidated, []);
});
