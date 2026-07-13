import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { acceptRideRequestForUser } from "./accept-ride-request";
import {
  contactActionReturnPath,
  contactSetupDestination,
} from "./route-targets";

type RpcResult = {
  data: unknown;
  error: { message: string; code: string } | null;
};

function acceptClient(
  {
    contact = { data: true, error: null },
    request = { rider_id: "rider-1" },
    accepted = { data: true, error: null },
    conversation = { data: "conversation-1", error: null },
  }: {
    contact?: RpcResult;
    request?: { rider_id: string } | null;
    accepted?: RpcResult;
    conversation?: RpcResult;
  },
  calls: string[],
) {
  const requestQuery = {
    select(columns: string) {
      calls.push(`select:${columns}`);
      return requestQuery;
    },
    eq(column: string, value: unknown) {
      calls.push(`eq:${column}:${String(value)}`);
      return requestQuery;
    },
    async single() {
      calls.push("single");
      return { data: request, error: null };
    },
  };

  return {
    from(table: string) {
      calls.push(`from:${table}`);
      return requestQuery;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(`rpc:${name}`);
      if (name === "profile_has_contact") {
        assert.equal(args.p_profile_id, "driver-1");
        return contact;
      }
      if (name === "accept_ride_request") {
        assert.equal(args.p_request_id, "request-1");
        return accepted;
      }
      if (name === "open_conversation") {
        assert.deepEqual(args, {
          p_other_user_id: "rider-1",
          p_ride_id: null,
          p_request_id: "request-1",
        });
        return conversation;
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  } as unknown as Parameters<typeof acceptRideRequestForUser>[0];
}

test("accept stops before mutation when contact is missing", async () => {
  const calls: string[] = [];
  const result = await acceptRideRequestForUser(
    acceptClient({ contact: { data: false, error: null } }, calls),
    "driver-1",
    "request-1",
  );

  assert.deepEqual(result, { status: "contact_required" });
  assert.deepEqual(calls, ["rpc:profile_has_contact"]);
});

test("accept fails closed before mutation when contact lookup fails", async () => {
  const calls: string[] = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await acceptRideRequestForUser(
      acceptClient(
        {
          contact: {
            data: null,
            error: { message: "unavailable", code: "PGRST000" },
          },
        },
        calls,
      ),
      "driver-1",
      "request-1",
    );

    assert.deepEqual(result, { status: "contact_required" });
    assert.deepEqual(calls, ["rpc:profile_has_contact"]);
  } finally {
    console.error = originalError;
  }
});

test("accept creates the passenger and conversation after contact succeeds", async () => {
  const calls: string[] = [];
  const result = await acceptRideRequestForUser(
    acceptClient({}, calls),
    "driver-1",
    "request-1",
  );

  assert.deepEqual(result, {
    status: "success",
    conversationId: "conversation-1",
  });
  assert.deepEqual(calls, [
    "rpc:profile_has_contact",
    "from:ride_requests",
    "select:rider_id",
    "eq:id:request-1",
    "single",
    "rpc:accept_ride_request",
    "rpc:open_conversation",
  ]);
});

test("accept retry migration preserves security and notifies only on first acceptance", () => {
  const migration = readFileSync(
    "supabase/migrations/20260713190208_accept_ride_request_idempotent_retry.sql",
    "utf8",
  );

  assert.match(migration, /security definer\s+set search_path = public/);
  assert.match(migration, /public\.is_banned\(auth\.uid\(\)\)/);
  assert.match(migration, /status = 'active'[\s\S]+coalesce\(latest_date, depart_at::date\) >= current_date/);
  assert.match(migration, /if found then[\s\S]+insert into public\.notifications[\s\S]+return true;\s+end if;/);
  assert.match(migration, /status = 'fulfilled'\s+and accepted_driver_id = auth\.uid\(\)/);
  assert.match(migration, /revoke all on function public\.accept_ride_request\(uuid\) from public, anon/);
  assert.match(migration, /grant execute on function public\.accept_ride_request\(uuid\) to authenticated, service_role/);
});

test("acceptRideRequest maps contact-required to a typed setup outcome", () => {
  const source = readFileSync("src/app/rides/actions.ts", "utf8");
  const fn = source.slice(
    source.indexOf("export async function acceptRideRequest"),
    source.indexOf("export async function requestSeat"),
  );

  assert.match(fn, /Promise<RedirectActionResult>/);
  assert.match(fn, /acceptRideRequestForUser/);
  assert.match(fn, /result\.status === "contact_required"/);
  assert.match(fn, /error: CONTACT_SETUP_MESSAGE/);
  assert.match(fn, /setupPath: contactSetupDestination/);
  assert.match(fn, /return \{ success: true, redirectTo:/);
});

test("accept setup path resumes sanitized desktop and mobile request destinations", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const desktopForm = new FormData();
  desktopForm.set("request_id", requestId);
  const desktopReturnPath = contactActionReturnPath(
    desktopForm,
    `/requests/${requestId}`,
  );
  assert.equal(desktopReturnPath, `/requests/${requestId}`);
  assert.equal(
    contactSetupDestination(desktopReturnPath),
    `/profile?contact_required=1&next=%2Frequests%2F${requestId}`,
  );

  const formData = new FormData();
  formData.set("base", "/m/messages");
  formData.set("request_id", requestId);

  const returnPath = contactActionReturnPath(
    formData,
    `/requests/${requestId}`,
  );
  assert.equal(returnPath, `/m/requests/${requestId}`);
  assert.equal(
    contactSetupDestination(returnPath, { mobile: true }),
    `/m/profile/edit?contact_required=1&next=%2Fm%2Frequests%2F${requestId}`,
  );
});

test("accept request UI surfaces actionable setup errors", () => {
  const rideActions = readFileSync("src/components/ride-actions.tsx", "utf8");
  const fn = rideActions.slice(
    rideActions.indexOf("export function AcceptRequestButton"),
    rideActions.indexOf("export function CancelRequestButton"),
  );

  assert.match(fn, /acceptRideRequest/);
  assert.match(fn, /"error" in result/);
  assert.match(fn, /InlineActionError/);
  assert.match(fn, /actionErrorMessage/);
  assert.match(fn, /formData\.set\("request_id", requestId\)/);
  assert.match(fn, /result\.setupPath/);
  assert.match(fn, /Finish contact info in profile/);
});
