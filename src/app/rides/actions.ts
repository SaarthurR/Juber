"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

function str(v: FormDataEntryValue | null) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

function parsePositiveInt(v: FormDataEntryValue | null, fallback: number, label: string) {
  const n = Number.parseInt(str(v) ?? String(fallback), 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${label} must be at least 1.`);
  }
  return n;
}

function parseNonNegativeNumber(v: FormDataEntryValue | null, label: string) {
  const raw = str(v);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be 0 or more.`);
  }
  return n;
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
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const seats = parsePositiveInt(formData.get("seats_total"), 1, "Seats available");
  const gas = parseNonNegativeNumber(formData.get("gas_contribution"), "Gas contribution");

  const { error } = await supabase.from("rides").insert({
    driver_id: user.id,
    origin_label: str(formData.get("origin_label")),
    destination_label:
      str(formData.get("destination_label")) ??
      "Jain Center of Northern California",
    depart_at: isoDate(formData.get("depart_at")),
    seats_total: seats,
    seats_available: seats,
    gas_contribution: gas,
    notes: str(formData.get("notes")),
    event_id: str(formData.get("event_id")),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/rides");
  redirect("/rides");
}

export async function postRequest(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const earliestDate = str(formData.get("earliest_date")); // "YYYY-MM-DD"
  const latestDate = str(formData.get("latest_date"));
  const maxPrice = parseNonNegativeNumber(formData.get("max_price"), "Max gas contribution");

  if (!earliestDate) throw new Error("Please choose a start date.");
  if (!latestDate) throw new Error("Please choose an end date.");
  const earliest = new Date(`${earliestDate}T00:00:00`);
  const latest = new Date(`${latestDate}T00:00:00`);
  if (Number.isNaN(earliest.getTime()) || Number.isNaN(latest.getTime())) {
    throw new Error("Please choose a valid date range.");
  }
  if (earliest > latest) {
    throw new Error("The start date must be before the end date.");
  }

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
    max_price: maxPrice,
    seats_needed: parsePositiveInt(formData.get("seats_needed"), 1, "Seats needed"),
    notes: str(formData.get("notes")),
    event_id: str(formData.get("event_id")),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/rides");
  redirect("/rides?tab=requests");
}

export async function cancelRideRequest(requestId: string) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { error } = await supabase
    .from("ride_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("rider_id", user.id)
    .eq("status", "active");

  if (error) throw new Error(error.message);
  revalidatePath("/rides");
  revalidatePath(`/requests/${requestId}`);
  redirect("/rides?tab=requests");
}

export async function acceptRideRequest(requestId: string) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { data, error } = await supabase.rpc("accept_ride_request", {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("This request is no longer available.");
  }

  const { data: request } = await supabase
    .from("ride_requests")
    .select("rider_id")
    .eq("id", requestId)
    .single<{ rider_id: string }>();
  if (!request) throw new Error("Could not find the accepted request.");

  const { data: existingConvos } = await supabase
    .from("conversations")
    .select("id")
    .eq("request_id", requestId);
  let conversationId = existingConvos?.[0]?.id ?? null;

  if (!conversationId) {
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .insert({ request_id: requestId })
      .select("id")
      .single();
    if (convoErr || !convo) throw new Error(convoErr?.message ?? "Could not start chat");
    conversationId = convo.id;

    const { error: participantErr } = await supabase.from("conversation_participants").insert([
      { conversation_id: conversationId, user_id: user.id },
      { conversation_id: conversationId, user_id: request.rider_id },
    ]);
    if (participantErr) throw new Error(participantErr.message);
  }

  revalidatePath("/rides");
  revalidatePath(`/requests/${requestId}`);
  redirect(`/messages/${conversationId}`);
}

export async function requestSeat(rideId: string) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { data: ride } = await supabase
    .from("rides")
    .select("driver_id,status,depart_at,seats_available")
    .eq("id", rideId)
    .single<{ driver_id: string; status: string; depart_at: string; seats_available: number }>();
  if (!ride) throw new Error("Ride not found.");
  if (ride.driver_id === user.id) throw new Error("You cannot reserve a seat in your own ride.");
  if (ride.status !== "active") throw new Error("This ride is not accepting reservations.");
  if (new Date(ride.depart_at) <= new Date()) throw new Error("This ride has already departed.");
  if (ride.seats_available <= 0) throw new Error("This ride is full.");

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
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { data: ride } = await supabase
    .from("rides")
    .select("driver_id,seats_available")
    .eq("id", rideId)
    .single<{ driver_id: string; seats_available: number }>();
  if (!ride || ride.driver_id !== user.id) {
    throw new Error("Only the driver can update passenger requests.");
  }
  if (status === "confirmed" && ride.seats_available <= 0) {
    throw new Error("This ride has no seats left.");
  }

  const { error } = await supabase
    .from("ride_passengers")
    .update({ status })
    .eq("id", passengerId)
    .eq("ride_id", rideId);
  if (error) throw new Error(error.message);
  revalidatePath(`/rides/${rideId}`);
}

export async function cancelRide(rideId: string, reason: string) {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) {
    throw new Error("Please tell your riders why the ride is cancelled.");
  }

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { error } = await supabase
    .from("rides")
    .update({ status: "cancelled", cancellation_reason: trimmed })
    .eq("id", rideId)
    .eq("driver_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/rides");
  redirect("/rides");
}
