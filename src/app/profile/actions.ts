"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import {
  authCallbackDestination,
  authRevalidationPath,
} from "@/lib/route-targets";
import { setHomeAddress } from "@/lib/home-address";
import {
  parseHomeAddress,
  profileSaveError,
  type ProfileFormState,
} from "@/lib/profile-save";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

export async function updateProfile(formData: FormData): Promise<ProfileFormState> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  const fallback = `/profile/${user.id}`;
  const nextValues = formData.getAll("next");
  const destination = authCallbackDestination(
    nextValues.length === 1 ? nextValues[0] : null,
    fallback,
  );
  const revalidationPath = authRevalidationPath(destination, fallback);

  const phone = str(formData.get("phone"));
  const whatsapp = str(formData.get("whatsapp"));
  if (!phone && !whatsapp) {
    if (nextValues.length !== 1) redirect("/profile?contact_required=1");
    const search = new URLSearchParams({
      contact_required: "1",
      next: destination,
    });
    redirect(`/profile?${search.toString()}`);
  }
  const requestedContact = str(formData.get("preferred_contact"));
  const preferredContact =
    requestedContact === "phone" && !phone
      ? "whatsapp"
      : requestedContact === "whatsapp" && !whatsapp
        ? "phone"
        : requestedContact;

  try {
    const homeAddress = parseHomeAddress(formData.get("home_address"));

    // phone/whatsapp live in the booking-scoped profile_contacts table (0020).
    // Upsert that first so the active-driver contact-retention guard can fire.
    const { error: contactError } = await supabase
      .from("profile_contacts")
      .upsert({ user_id: user.id, phone, whatsapp, updated_at: new Date().toISOString() });
    if (contactError) throw new Error(contactError.message);

    await setHomeAddress(supabase, homeAddress);

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
  } catch (error) {
    return { error: profileSaveError(error) };
  }

  revalidatePath("/profile");
  revalidatePath(revalidationPath);
  redirect(destination);
}
