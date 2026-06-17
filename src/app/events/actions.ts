"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

export async function requestEvent(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const name = str(formData.get("name"));
  if (!name) return;

  const { error } = await supabase.from("event_requests").insert({
    name,
    description: str(formData.get("description")),
    venue_label: str(formData.get("venue_label")),
    start_date: str(formData.get("start_date")),
    end_date: str(formData.get("end_date")),
    expected_traffic: str(formData.get("expected_traffic")) ?? "unsure",
    requested_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/events");
  revalidatePath("/m/events");
  revalidatePath("/admin");
}
