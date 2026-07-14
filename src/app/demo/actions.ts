"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  localDemoUnlockEnabled,
  requireAdminOwner,
  validPresenterPasscode,
} from "@/lib/demo/access";
import { getDemoRuntime, getDemoStore, requireDemoRuntime } from "@/lib/demo/runtime";
import { createDemoSessionToken, DEMO_SESSION_COOKIE } from "@/lib/demo/session";

async function setSessionCookie(token: string) {
  (await cookies()).set(DEMO_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: token ? 86_400 : 0,
  });
}

export async function enableDemoModeAction() {
  const current = await getDemoRuntime();
  const identity = current ? null : await getCurrentUser();
  const owner = current
    ? { ownerKind: current.ownerKind, ownerId: current.ownerId }
    : requireAdminOwner(identity!.user, identity!.profile);
  const session = await getDemoStore().create(owner);
  await setSessionCookie(createDemoSessionToken(session.id));
  redirect("/admin");
}

export async function unlockDemoModeAction(formData: FormData) {
  const passcode = formData.get("passcode");
  if (
    !localDemoUnlockEnabled()
    || typeof passcode !== "string"
    || !validPresenterPasscode(passcode, process.env.DEMO_ADMIN_PASSCODE)
  ) {
    throw new Error("Invalid demo presenter passcode");
  }
  const session = await getDemoStore().create({ ownerKind: "local", ownerId: "local-presenter" });
  await setSessionCookie(createDemoSessionToken(session.id));
  redirect("/admin");
}

export async function resetDemoModeAction() {
  const runtime = await requireDemoRuntime();
  await getDemoStore().reset(runtime.id);
  revalidatePath("/", "layout");
}

export async function disableDemoModeAction() {
  const runtime = await requireDemoRuntime();
  await getDemoStore().delete(runtime.id);
  await setSessionCookie("");
  redirect("/admin");
}

export async function switchDemoActorAction(formData: FormData) {
  const runtime = await requireDemoRuntime();
  const actorId = formData.get("actorId");
  if (typeof actorId !== "string") throw new Error("Demo actor required");
  await getDemoStore().mutate(runtime.id, undefined, { type: "switch_actor", actorId });
  revalidatePath("/", "layout");
}
