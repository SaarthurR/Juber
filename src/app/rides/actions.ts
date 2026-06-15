"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

// Parse a datetime-local value into an ISO string, rejecting empty/invalid input.
function isoDate(v: FormDataEntryValue | null) {
  const raw = str(v);
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) {
    throw new Error("Please choose a valid departure date and time.");
  }
  return d.toISOString();
}

export async function postRide(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const seats = parseInt(str(formData.get("seats_total")) ?? "1", 10);
  const gas = str(formData.get("gas_contribution"));

  const { error } = await supabase.from("rides").insert({
    driver_id: user.id,
    origin_label: str(formData.get("origin_label")),
    destination_label:
      str(formData.get("destination_label")) ??
      "Jain Center of Northern California",
    depart_at: isoDate(formData.get("depart_at")),
    seats_total: seats,
    seats_available: seats,
    gas_contribution: gas ? Number(gas) : null,
    notes: str(formData.get("notes")),
    event_id: str(formData.get("event_id")),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/rides");
  redirect("/rides");
}

export async function postRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const earliestDate = str(formData.get("earliest_date")); // "YYYY-MM-DD"
  const latestDate = str(formData.get("latest_date"));
  const maxPrice = str(formData.get("max_price"));

  if (!earliestDate) throw new Error("Please choose a start date.");
  if (!latestDate) throw new Error("Please choose an end date.");

  // depart_at set to noon on earliest_date for backward-compat queries
  const departAt = new Date(`${earliestDate}T12:00:00`).toISOString();

  const { error } = await supabase.from("ride_requests").insert({
    rider_id: user.id,
    origin_label: str(formData.get("origin_label")),
    destination_label:
      str(formData.get("destination_label")) ??
      "Jain Center of Northern California",
    depart_at: departAt,
    earliest_date: earliestDate,
    latest_date: latestDate,
    max_price: maxPrice ? Number(maxPrice) : null,
    seats_needed: parseInt(str(formData.get("seats_needed")) ?? "1", 10),
    notes: str(formData.get("notes")),
    event_id: str(formData.get("event_id")),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/requests");
  revalidatePath("/rides");
  redirect("/requests");
}

export async function requestSeat(rideId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { error } = await supabase
    .from("ride_passengers")
    .insert({ ride_id: rideId, passenger_id: user.id })
    .select()
    .single();

  // Ignore duplicate-join errors (unique constraint).
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  revalidatePath(`/rides/${rideId}`);
}

export async function setPassengerStatus(
  passengerId: string,
  rideId: string,
  status: "confirmed" | "declined",
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ride_passengers")
    .update({ status })
    .eq("id", passengerId);
  if (error) throw new Error(error.message);
  revalidatePath(`/rides/${rideId}`);
}

export async function cancelRide(rideId: string, reason: string) {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) {
    throw new Error("Please tell your riders why the ride is cancelled.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("rides")
    .update({ status: "cancelled", cancellation_reason: trimmed })
    .eq("id", rideId);
  if (error) throw new Error(error.message);
  revalidatePath("/rides");
  redirect("/rides");
}
