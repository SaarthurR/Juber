import { timingSafeEqual } from "node:crypto";
import type { Profile } from "../types";
import type { DemoSession } from "./types";

export type DemoAuthUser = { id: string; email: string | null };

export function requireAdminOwner(
  user: DemoAuthUser | null,
  profile: Profile | null,
) {
  if (!user || !profile?.is_admin || profile.id !== user.id) {
    throw new Error("Administrator access required");
  }
  return { ownerKind: "admin" as const, ownerId: user.id };
}

export function validPresenterPasscode(supplied: string, expected: string | undefined) {
  if (!expected || expected.length < 32) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function localDemoUnlockEnabled(
  passcode = process.env.DEMO_ADMIN_PASSCODE,
  sqlitePath = process.env.DEMO_SQLITE_PATH,
) {
  return Boolean(passcode && passcode.length >= 32 && sqlitePath);
}

export function demoIdentity(session: DemoSession) {
  const profile = session.state.profiles[session.activeActorId];
  if (!profile) throw new Error("Demo actor not found");
  return {
    user: { id: profile.id, email: null } satisfies DemoAuthUser,
    profile,
  };
}

export async function resolveIdentity(
  session: DemoSession | null,
  live: () => Promise<{ user: DemoAuthUser | null; profile: Profile | null }>,
) {
  return session ? demoIdentity(session) : live();
}
