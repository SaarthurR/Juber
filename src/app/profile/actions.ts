"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const rawInsta = str(formData.get("instagram"));
  const instagram = rawInsta?.startsWith("@") ? rawInsta.slice(1) : rawInsta;

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: str(formData.get("full_name")),
      pronouns: str(formData.get("pronouns")),
      neighborhood: str(formData.get("neighborhood")),
      phone: str(formData.get("phone")),
      instagram,
      preferred_contact: str(formData.get("preferred_contact")),
      car_make_model: str(formData.get("car_make_model")),
      car_color: str(formData.get("car_color")),
      bio: str(formData.get("bio")),
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/profile");
  redirect(`/profile/${user.id}`);
}
