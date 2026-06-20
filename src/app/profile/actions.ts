"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const phone = str(formData.get("phone"));
  const whatsapp = str(formData.get("whatsapp"));
  if (!phone && !whatsapp) redirect("/profile?contact_required=1");
  const requestedContact = str(formData.get("preferred_contact"));
  const preferredContact =
    requestedContact === "phone" && !phone
      ? "whatsapp"
      : requestedContact === "whatsapp" && !whatsapp
        ? "phone"
        : requestedContact;

  // phone/whatsapp live in the booking-scoped profile_contacts table (0020).
  // Upsert that first so the active-driver contact-retention guard can fire.
  const { error: contactError } = await supabase
    .from("profile_contacts")
    .upsert({ user_id: user.id, phone, whatsapp, updated_at: new Date().toISOString() });
  if (contactError) throw new Error(contactError.message);

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: str(formData.get("full_name")),
      pronouns: str(formData.get("pronouns")),
      neighborhood: str(formData.get("neighborhood")),
      preferred_contact: preferredContact,
      car_make_model: str(formData.get("car_make_model")),
      car_color: str(formData.get("car_color")),
      bio: str(formData.get("bio")),
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/profile");
  redirect(`/profile/${user.id}`);
}
