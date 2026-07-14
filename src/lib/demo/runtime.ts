import { cache } from "react";
import { cookies } from "next/headers";
import { DEMO_SESSION_COOKIE, verifyDemoSessionToken } from "./session";
import { createClient } from "@/lib/supabase/server";
import {
  SqliteDemoSessionStore,
  SupabaseDemoSessionStore,
  type DemoSessionStore,
} from "./store";

const runtimeGlobal = globalThis as typeof globalThis & {
  juberDemoStore?: SqliteDemoSessionStore;
};

async function resolveStore(): Promise<DemoSessionStore> {
  if (process.env.DEMO_SQLITE_PATH) {
    return runtimeGlobal.juberDemoStore ??= new SqliteDemoSessionStore();
  }
  return new SupabaseDemoSessionStore(await createClient());
}

const store: DemoSessionStore = {
  create: async (input) => (await resolveStore()).create(input),
  read: async (id) => (await resolveStore()).read(id),
  getRevision: async (id) => (await resolveStore()).getRevision(id),
  mutate: async (id, revision, command) => (await resolveStore()).mutate(id, revision, command),
  reset: async (id, revision) => (await resolveStore()).reset(id, revision),
  delete: async (id) => (await resolveStore()).delete(id),
  prune: async () => (await resolveStore()).prune(),
};

export function getDemoStore() {
  return store;
}

export const getDemoRuntime = cache(async () => {
  const token = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
  let sessionId: string | null = null;
  try {
    sessionId = verifyDemoSessionToken(token);
  } catch {
    return null;
  }
  return sessionId ? getDemoStore().read(sessionId) : null;
});

export async function requireDemoRuntime() {
  const runtime = await getDemoRuntime();
  if (!runtime) throw new Error("Demo session required");
  return runtime;
}
