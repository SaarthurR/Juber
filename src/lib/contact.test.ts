import test from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverOnlyStub = "server-only-stub";
type ResolveFilename = (
  request: string,
  parent: NodeModule,
  isMain: boolean,
  options?: { paths?: string[] },
) => string;

const nodeModule = Module as typeof Module & { _resolveFilename: ResolveFilename };
const resolveFilename = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return serverOnlyStub;
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};
require.cache[serverOnlyStub] = {
  id: serverOnlyStub,
  filename: serverOnlyStub,
  loaded: true,
  exports: {},
} as NodeModule;

type HasContact = typeof import("./contact").hasContact;

let hasContact: HasContact;

test.before(async () => {
  ({ hasContact } = await import("./contact"));
});

test.after(() => {
  nodeModule._resolveFilename = resolveFilename;
  delete require.cache[serverOnlyStub];
});

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

test("hasContact fails open when RPC errors", async () => {
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
    assert.equal(await hasContact(supabase, "user-1"), true);
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
