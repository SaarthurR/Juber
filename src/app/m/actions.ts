"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { JCNC_LABEL } from "@/lib/constants";
import { dateOnlyToIso } from "@/lib/date-time";
import { authCallbackDestination, authRevalidationPath } from "@/lib/route-targets";
import { setHomeAddress } from "@/lib/home-address";
import { hasContact } from "@/lib/contact-readiness";
import {
  mapCoarseLabelDbError,
  validateCoarseLabel,
} from "@/lib/coarse-label";
import { mapInsertError } from "@/lib/rate-limit";
import {
  parseHomeAddress,
  profileSaveError,
  type ProfileFormState,
} from "@/lib/profile-save";
import type { RequestFormState } from "@/app/rides/actions";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

function parsePositiveInt(v: FormDataEntryValue | null, fallback: number, label: string) {
  const n = Number.parseInt(str(v) ?? String(fallback), 10);
  if (!Number.isFinite(n) || n < 1) throw new Error(`${label} must be at least 1.`);
  return n;
}

function parseNonNegativeNumber(v: FormDataEntryValue | null, label: string) {
  const raw = str(v);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be 0 or more.`);
  return n;
}

async function activePlaceNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
  const { data } = await supabase.from("places").select("name").eq("active", true);
  return new Set((data ?? []).map((row) => row.name as string));
}

function assertCoarseLabels(
  labels: Array<string | null>,
  presets: ReadonlySet<string>,
) {
  for (const label of labels) {
    const error = validateCoarseLabel(label, presets);
    if (error) throw new Error(error);
  }
}

export async function postRequestMobile(
  _previousState: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/m");

  try {
    if (!(await hasContact(supabase, user.id))) {
      throw new Error("Add a phone or WhatsApp number to your profile before posting a ride request.");
    }
    const direction = str(formData.get("direction")) ?? "toJCNC";
    const neighborhood = str(formData.get("neighborhood"));
    if (!neighborhood) throw new Error("Please choose your pick-up neighborhood.");

    const origin = direction === "toJCNC" ? neighborhood : JCNC_LABEL;
    const destination = direction === "toJCNC" ? JCNC_LABEL : neighborhood;
    const presets = await activePlaceNames(supabase);
    assertCoarseLabels([origin, destination], presets);

    const earliestDate = str(formData.get("earliest_date"));
    const latestDate = str(formData.get("latest_date"));
    if (!earliestDate) throw new Error("Please choose a start date.");
    if (!latestDate) throw new Error("Please choose an end date.");
    const earliest = dateOnlyToIso(earliestDate, "00:00");
    const latest = dateOnlyToIso(latestDate, "00:00");
    if (new Date(earliest) > new Date(latest)) {
      throw new Error("The start date must be before the end date.");
    }

    const departAt = dateOnlyToIso(earliestDate);

    const { error } = await supabase.from("ride_requests").insert({
      rider_id: user.id,
      origin_label: origin,
      destination_label: destination,
      depart_at: departAt,
      earliest_date: earliestDate,
      latest_date: latestDate,
      max_price: parseNonNegativeNumber(formData.get("max_price"), "Max gas"),
      seats_needed: parsePositiveInt(formData.get("seats_needed"), 1, "Seats"),
      notes: str(formData.get("notes")),
      event_id: str(formData.get("event_id")),
    });

    if (error) {
      throw new Error(
        mapInsertError(error, "Unable to post this request.", mapCoarseLabelDbError),
      );
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? mapCoarseLabelDbError(error.message)
          : "Unable to post this request.",
    };
  }
  revalidatePath("/rides");
  revalidatePath("/m");
  revalidatePath("/m/requests");
  redirect("/m/requests");
}

/** Save mobile profile edits, then return to a sanitized onboarding destination. */
export async function updateProfileMobile(
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/m");
  const fallback = "/m/profile";
  const nextValues = formData.getAll("next");
  const destination = authCallbackDestination(
    nextValues.length === 1 ? nextValues[0] : null,
    fallback,
  );
  const revalidationPath = authRevalidationPath(destination, fallback);

  const phone = str(formData.get("phone"));
  const whatsapp = str(formData.get("whatsapp"));
  if (!phone && !whatsapp) {
    if (nextValues.length !== 1) redirect("/m/profile/edit?contact_required=1");
    const search = new URLSearchParams({
      contact_required: "1",
      next: destination,
    });
    redirect(`/m/profile/edit?${search.toString()}`);
  }
  const requestedContact = str(formData.get("preferred_contact"));
  const preferredContact =
    requestedContact === "phone" && !phone
      ? "whatsapp"
      : requestedContact === "whatsapp" && !whatsapp
        ? "phone"
        : requestedContact;

  const first = str(formData.get("first_name")) ?? "";
  const lastInitial = str(formData.get("last_initial")) ?? "";
  const fullName = [first, lastInitial].filter(Boolean).join(" ") || null;

  try {
    const homeAddress = parseHomeAddress(formData.get("home_address"));

    // phone/whatsapp live in the booking-scoped profile_contacts table (0020).
    const { error: contactError } = await supabase
      .from("profile_contacts")
      .upsert({ user_id: user.id, phone, whatsapp, updated_at: new Date().toISOString() });
    if (contactError) throw new Error(contactError.message);

    await setHomeAddress(supabase, homeAddress);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        pronouns: str(formData.get("pronouns")),
        neighborhood: str(formData.get("neighborhood")),
        preferred_contact: preferredContact,
        car_make_model: str(formData.get("car_make_model")),
      })
      .eq("id", user.id);

    if (error) throw new Error(error.message);
  } catch (error) {
    return { error: profileSaveError(error) };
  }

  revalidatePath("/profile");
  revalidatePath("/m/profile");
  revalidatePath(revalidationPath);
  redirect(destination);
}
