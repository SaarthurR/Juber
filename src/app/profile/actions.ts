"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import {
  authCallbackDestination,
  authRevalidationPath,
} from "@/lib/route-targets";
import { getHomeAddress, setHomeAddress } from "@/lib/home-address";
import { requireGoogleAddressSelection } from "@/lib/driver-route";
import {
  parseHomeAddress,
  profileSaveError,
  type ProfileFormState,
} from "@/lib/profile-save";
import { demoProfileCommands } from "@/lib/demo/action-inputs";
import { getDemoRuntime, getDemoStore } from "@/lib/demo/runtime";

const DEMO_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEMO_AVATAR_MAX_BYTES = 4 * 1024 * 1024;

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

export async function updateProfile(formData: FormData): Promise<ProfileFormState> {
  const demo = await getDemoRuntime();
  if (demo) {
    const fallback = `/profile/${demo.activeActorId}`;
    const nextValues = formData.getAll("next");
    const destination = authCallbackDestination(nextValues.length === 1 ? nextValues[0] : null, fallback);
    const revalidationPath = authRevalidationPath(destination, fallback);
    const phone = str(formData.get("phone"));
    const whatsapp = str(formData.get("whatsapp"));
    if (!phone && !whatsapp) return { error: "Add a phone or WhatsApp number." };
    try {
      const [profileCommand, contactCommand] = demoProfileCommands(demo, formData, str(formData.get("full_name")));
      const next = await getDemoStore().mutate(demo.id, demo.revision, profileCommand);
      await getDemoStore().mutate(next.id, next.revision, contactCommand);
    } catch (error) {
      return { error: profileSaveError(error) };
    }
    revalidatePath("/profile");
    revalidatePath(revalidationPath);
    redirect(destination);
  }
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
    requireGoogleAddressSelection({
      address: homeAddress,
      placeId: formData.get("home_address_place_id"),
      placeType: formData.get("home_address_place_type"),
      previousAddress: await getHomeAddress(supabase),
      enabled: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLACES_KEY?.trim()),
      label: "your home address",
    });

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

export async function updateDemoAvatar(formData: FormData) {
  const demo = await getDemoRuntime();
  if (!demo) return { error: "Demo mode is not active." };
  const file = formData.get("avatar");
  if (!(file instanceof File) || !DEMO_AVATAR_TYPES.has(file.type)) return { error: "Use a JPG, PNG, or WebP image." };
  if (file.size > DEMO_AVATAR_MAX_BYTES) return { error: "Image must be under 4MB." };
  const avatarUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  try {
    await getDemoStore().mutate(demo.id, demo.revision, {
      type: "update_profile",
      actorId: demo.activeActorId,
      values: { avatar_url: avatarUrl },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update the demo photo." };
  }
  revalidatePath("/profile");
  revalidatePath("/m/profile");
  return { success: true as const, avatarUrl };
}
