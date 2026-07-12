"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeSignOut, type SignOutState } from "@/lib/sign-out";

export async function signOutAction(
  previousState: SignOutState,
  formData: FormData,
): Promise<SignOutState> {
  void previousState;
  void formData;
  return completeSignOut(createClient, redirect);
}
