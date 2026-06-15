"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function requireAdmin() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/");
  return { supabase, user };
}

export async function createEvent(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const name = str(formData.get("name"));
  if (!name) return;

  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

  const { error } = await supabase.from("events").insert({
    name,
    slug,
    description: str(formData.get("description")),
    venue_label: str(formData.get("venue_label")),
    start_date: str(formData.get("start_date")),
    end_date: str(formData.get("end_date")),
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/events");
}

export async function createPlace(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = str(formData.get("name"));
  if (!name) return;

  const { error } = await supabase.from("places").insert({
    name,
    address: str(formData.get("address")),
    kind: str(formData.get("kind")) ?? "neighborhood",
    event_id: str(formData.get("event_id")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function deleteEvent(eventId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("events").delete().eq("id", eventId);
  revalidatePath("/admin");
  revalidatePath("/events");
}

export async function deletePlace(placeId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("places").delete().eq("id", placeId);
  revalidatePath("/admin");
}
