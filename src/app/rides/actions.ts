"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { JCNC_LABEL } from "@/lib/constants";
import { sendSms } from "@/lib/sms";

type CancellationContact = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

function cancellationName(contact: CancellationContact | undefined, fallback: string) {
  return contact?.full_name?.trim() || fallback;
}

async function sendCancellationTexts(messages: Array<Parameters<typeof sendSms>[0]>) {
  const results = await Promise.allSettled(messages.map(sendSms));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Cancellation SMS failed", result.reason);
    }
  }
}

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
  const eventId = str(formData.get("event_id"));
  const direction = str(formData.get("direction"));
  const routePlace = str(formData.get("route_place"));
  const fallbackOrigin = str(formData.get("origin_label"));
  const fallbackDestination = str(formData.get("destination_label"));
  const origin =
    direction === "from_jcnc" ? JCNC_LABEL : routePlace ?? fallbackOrigin;
  const destination =
    direction === "from_jcnc" ? routePlace ?? fallbackDestination : JCNC_LABEL;
  const departAt = isoDate(formData.get("depart_at"));
  const roundTrip = str(formData.get("round_trip")) === "true";
  const returnDepartAt = roundTrip ? isoDate(formData.get("return_depart_at")) : null;

  if (!origin || !destination) {
    throw new Error("Please choose whether this ride is to or from JCNC and add the city.");
  }

  if (returnDepartAt && new Date(returnDepartAt) <= new Date(departAt)) {
    throw new Error("Return time must be after the outbound departure.");
  }

  if (eventId) {
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("is_active", true)
      .single<{ id: string }>();
    if (!event) {
      throw new Error("Please choose a live event, or select no specific event.");
    }
  }

  const { error } = await supabase.from("rides").insert({
    driver_id: user.id,
    origin_label: origin,
    destination_label: destination,
    pickup_location: str(formData.get("pickup_location")),
    dropoff_location: str(formData.get("dropoff_location")),
    depart_at: departAt,
    round_trip: roundTrip,
    return_depart_at: returnDepartAt,
    return_notes: roundTrip ? str(formData.get("return_notes")) : null,
    seats_total: seats,
    seats_available: seats,
    gas_contribution: gas,
    notes: str(formData.get("notes")),
    event_id: eventId,
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
      "JCNC",
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

  const { data: request } = await supabase
    .from("ride_requests")
    .select("rider_id")
    .eq("id", requestId)
    .single<{ rider_id: string }>();
  if (!request) throw new Error("Could not find this request.");
  if (request.rider_id === user.id) {
    throw new Error("You cannot accept your own ride request.");
  }

  const { data, error } = await supabase.rpc("accept_ride_request", {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("This request is no longer available.");
  }

  const { data: conversationId, error: convoError } = await supabase.rpc("open_conversation", {
    p_other_user_id: request.rider_id,
    p_ride_id: null,
    p_request_id: requestId,
  });
  if (convoError || !conversationId) {
    throw new Error(convoError?.message ?? "Could not start chat");
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

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const [{ data: ride }, { data: passengers }] = await Promise.all([
    supabase
      .from("rides")
      .select("driver_id,origin_label,destination_label")
      .eq("id", rideId)
      .single<{
        driver_id: string;
        origin_label: string;
        destination_label: string;
      }>(),
    supabase
      .from("ride_passengers")
      .select("passenger_id")
      .eq("ride_id", rideId)
      .eq("status", "confirmed"),
  ]);
  const passengerIds = passengers?.map((passenger) => passenger.passenger_id) ?? [];
  if (passengerIds.length > 0 && !trimmed) {
    return { error: "Please tell your riders why the ride is cancelled." };
  }
  // Older deployed versions of cancel_ride require a non-empty reason even
  // when nobody is booked. Keep empty-ride cancellation compatible with them.
  const cancellationReason = trimmed || "Ride cancelled before anyone joined.";
  const contactIds = [...new Set([user.id, ...passengerIds])];
  const { data: contacts } = contactIds.length
    ? await supabase
        .from("profiles")
        .select("id,full_name,phone")
        .in("id", contactIds)
        .returns<CancellationContact[]>()
    : { data: [] as CancellationContact[] };

  const { data: cancelled, error } = await supabase.rpc("cancel_ride", {
    p_ride_id: rideId,
    p_reason: cancellationReason,
  });
  if (error) {
    console.error("cancel_ride failed", { code: error.code, rideId });
    return { error: "We couldn't cancel this ride. Please try again." };
  }
  if (!cancelled) return { error: "Only the driver can cancel an active ride." };

  if (ride?.driver_id === user.id) {
    const contactsById = new Map(contacts?.map((contact) => [contact.id, contact]));
    const driverName = cancellationName(contactsById.get(user.id), "Your driver");
    const route = `${ride.origin_label} to ${ride.destination_label}`;
    await sendCancellationTexts(
      passengerIds.map((passengerId) => ({
        to: contactsById.get(passengerId)?.phone ?? null,
        body: `${driverName} cancelled your ride from ${route}. Reason: ${trimmed}`,
      })),
    );
  }

  revalidatePath("/rides");
  revalidatePath("/messages");
  redirect("/rides");
}

export async function closeRide(rideId: string) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { data: closed, error } = await supabase.rpc("close_ride", {
    p_ride_id: rideId,
  });
  if (error) throw new Error(error.message);
  if (!closed) throw new Error("Only the driver can close an active ride.");

  revalidatePath("/rides");
  revalidatePath("/messages");
  revalidatePath(`/rides/${rideId}`);
  redirect("/rides");
}

export async function cancelSeat(rideId: string, message: string, redirectTo?: string) {
  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return { error: "Please tell the driver why you are cancelling." };
  }

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { data: ride } = await supabase
    .from("rides")
    .select("driver_id,origin_label,destination_label")
    .eq("id", rideId)
    .single<{
      driver_id: string;
      origin_label: string;
      destination_label: string;
    }>();
  const { data: contacts } = ride
    ? await supabase
        .from("profiles")
        .select("id,full_name,phone")
        .in("id", [user.id, ride.driver_id])
        .returns<CancellationContact[]>()
    : { data: [] as CancellationContact[] };

  const { data: cancelled, error } = await supabase.rpc("cancel_seat", {
    p_ride_id: rideId,
    p_reason: trimmed,
  });
  if (error) {
    console.error("cancel_seat failed", { code: error.code, rideId });
    return { error: "We couldn't cancel your seat. Please try again." };
  }
  if (!cancelled) return { error: "You are not currently in this active ride." };

  if (ride) {
    const contactsById = new Map(contacts?.map((contact) => [contact.id, contact]));
    const riderName = cancellationName(contactsById.get(user.id), "A rider");
    const route = `${ride.origin_label} to ${ride.destination_label}`;
    await sendCancellationTexts([
      {
        to: contactsById.get(ride.driver_id)?.phone ?? null,
        body: `${riderName} cancelled their seat for your ride from ${route}. Reason: ${trimmed}`,
      },
    ]);
  }

  revalidatePath("/rides");
  revalidatePath(`/rides/${rideId}`);
  revalidatePath("/messages");
  redirect(redirectTo ?? `/rides/${rideId}`);
}
