import test from "node:test";
import assert from "node:assert/strict";
import {
  completeSignOut,
  performSignOut,
  SIGN_OUT_ERROR_MESSAGE,
} from "./sign-out";

test("performSignOut signs out only the current session", async () => {
  const scopes: string[] = [];
  const result = await performSignOut(async () => ({
    auth: {
      signOut: async ({ scope }) => {
        scopes.push(scope);
        return { error: null };
      },
    },
  }));

  assert.equal(result, null);
  assert.deepEqual(scopes, ["local"]);
});

test("performSignOut returns a safe visible error when Supabase rejects sign-out", async () => {
  const result = await performSignOut(async () => ({
    auth: {
      signOut: async () => ({ error: new Error("sensitive provider detail") }),
    },
  }));

  assert.deepEqual(result, { error: SIGN_OUT_ERROR_MESSAGE });
  assert.doesNotMatch(result?.error ?? "", /sensitive provider detail/);
});

test("performSignOut returns the same safe error when client creation throws", async () => {
  const result = await performSignOut(async () => {
    throw new Error("missing cookie state");
  });

  assert.deepEqual(result, { error: SIGN_OUT_ERROR_MESSAGE });
});

test("completeSignOut redirects home only after Supabase succeeds", async () => {
  const redirects: string[] = [];
  const result = await completeSignOut(
    async () => ({
      auth: {
        signOut: async () => ({ error: null }),
      },
    }),
    (destination) => {
      redirects.push(destination);
    },
  );

  assert.equal(result, null);
  assert.deepEqual(redirects, ["/"]);
});

test("completeSignOut returns an error and does not redirect on failure", async () => {
  const redirects: string[] = [];
  const result = await completeSignOut(
    async () => ({
      auth: {
        signOut: async () => ({ error: new Error("provider failure") }),
      },
    }),
    (destination) => {
      redirects.push(destination);
    },
  );

  assert.deepEqual(result, { error: SIGN_OUT_ERROR_MESSAGE });
  assert.deepEqual(redirects, []);
});
