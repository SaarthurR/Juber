import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hasContact } from "./contact-readiness";

type HasContact = typeof hasContact;

type RpcResult = {
  data: boolean | null;
  error: {
    message: string;
    code: string;
    details: string;
    hint: string;
  } | null;
};

function stubSupabase(result: RpcResult) {
  return {
    rpc: async (fn: string) => {
      assert.equal(fn, "profile_has_contact");
      return result;
    },
  } as unknown as Parameters<HasContact>[0];
}

test("hasContact returns false when RPC reports no contact", async () => {
  const supabase = stubSupabase({ data: false, error: null });
  assert.equal(await hasContact(supabase, "user-1"), false);
});

test("hasContact returns true only when RPC confirms contact", async () => {
  const supabase = stubSupabase({ data: true, error: null });
  assert.equal(await hasContact(supabase, "user-1"), true);
});

test("hasContact fails closed when RPC errors", async () => {
  const errorLogs: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errorLogs.push(args);
  };
  try {
    const supabase = stubSupabase({
      data: null,
      error: {
        message: "connection failed",
        code: "PGRST000",
        details: "",
        hint: "",
      },
    });
    assert.equal(await hasContact(supabase, "user-1"), false);
    assert.deepEqual(errorLogs, [
      ["profile_has_contact failed", { code: "PGRST000", userId: "user-1" }],
    ]);
  } finally {
    console.error = originalError;
  }
});

test("hasContact returns false without user id", async () => {
  const supabase = stubSupabase({ data: true, error: null });
  assert.equal(await hasContact(supabase, null), false);
  assert.equal(await hasContact(supabase, undefined), false);
});

test("contact-gated callers share the pure fail-closed helper", () => {
  const sources = [
    "../app/auth/callback/route.ts",
    "../app/(desktop)/requests/new/page.tsx",
    "../app/(desktop)/rides/new/page.tsx",
    "../app/m/requests/new/page.tsx",
    "../app/m/rides/new/page.tsx",
    "../app/m/actions.ts",
    "../app/rides/actions.ts",
    "../app/messages/actions.ts",
  ];

  for (const source of sources) {
    const contents = readFileSync(
      fileURLToPath(new URL(source, import.meta.url)),
      "utf8",
    );
    assert.match(contents, /from "@\/lib\/contact-readiness"/, source);
    assert.doesNotMatch(contents, /\.rpc\("profile_has_contact"/, source);
  }

  const serverContact = readFileSync(
    fileURLToPath(new URL("./contact.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(serverContact, /function hasContact/);
});
