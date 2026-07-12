import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { performSignOut } from "@/lib/sign-out";

export async function POST(request: Request) {
  const state = await performSignOut(createClient);
  if (state) {
    return NextResponse.json(state, { status: 500 });
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
