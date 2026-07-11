"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";
import { JCNC_LABEL } from "@/lib/constants";
import { dateOnlyToIso } from "@/lib/date-time";
import {
  deferBestEffort,
  emptyRideCancellationReason,
} from "@/lib/action-lifecycle";
import {
  sendRideCancellationSms,
  sendSeatCancellationSms,
} from "@/lib/cancellation-sms";
import {
  MESSAGE_BASE_TARGETS,
  RIDE_LIST_TARGETS,
  pickAllowed,
  requestListDestination,
  requestRevalidationTargets,
  rideDetailDestination,
} from "@/lib/route-targets";

function revalidateMessageRoutes() {
  revalidatePath("/messages");
  revalidatePath("/m/messages");
  revalidatePath("/messages/[id]", "page");
  revalidatePath("/m/messages/[id]", "page");
}

function revalidateRequestRoutes(requestId: string) {
  for (const path of requestRevalidationTargets(requestId)) {
    revalidatePath(path);
  }
}

function logDeferredCancellationError(
  kind: "ride" | "seat",
  rideId: string,
  error: unknown,
) {
  console.error("Deferred cancellation SMS failed", {
    kind,
    rideId,
    error: error instanceof Error ? error.message : "Unknown error",
  });
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

export type RideFormState = { error: string } | null;
export type RequestFormState = { error: string } | null;
export type RideActionState = { error: string } | null;
export type RedirectActionResult =
  | { success: true; redirectTo: string }
  | { error: string };

export async function postRide(
  _previousState: RideFormState,
  formData: FormData,
): Promise<RideFormState> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  try {
    const { data: contactReady } = await supabase.rpc("profile_has_contact", {
      p_profile_id: user.id,
    });
    if (!contactReady) {
      throw new Error("Add a phone or WhatsApp number to your profile before posting a ride.");
    }
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
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to post this ride." };
  }

  revalidatePath("/rides");
  redirect("/rides");
}

export async function postRequest(
  _previousState: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  try {
    const earliestDate = str(formData.get("earliest_date"));
    const latestDate = str(formData.get("latest_date"));
    const maxPrice = parseNonNegativeNumber(formData.get("max_price"), "Max gas contribution");

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
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to post this request." };
  }
  revalidatePath("/rides");
  redirect("/rides?tab=requests");
}

export async function cancelRideRequest(
  requestId: string,
  formData?: FormData,
): Promise<RedirectActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  const redirectTo = requestListDestination(formData?.get("base")?.toString());

  const { data: cancelled, error } = await supabase
    .from("ride_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("rider_id", user.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("cancel ride request failed", { code: error.code, requestId });
    return { error: "We couldn't cancel this request. Please try again." };
  }
  if (!cancelled) return { error: "This request is no longer active." };

  revalidateRequestRoutes(requestId);
  return { success: true, redirectTo };
}

export async function acceptRideRequest(requestId: string, formData?: FormData) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  const base = pickAllowed(formData?.get("base")?.toString(), MESSAGE_BASE_TARGETS, "/messages");

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

  revalidateRequestRoutes(requestId);
  revalidateMessageRoutes();
  redirect(`${base}/${conversationId}`);
}

export async function requestSeat(
  rideId: string,
  _previousState: RideActionState,
  formData: FormData,
): Promise<RideActionState> {
  void formData;
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { error } = await supabase.rpc("request_seat", { p_ride_id: rideId });
  if (error) return { error: error.message };

  revalidatePath(`/rides/${rideId}`);
  revalidatePath(`/m/rides/${rideId}`);
  revalidatePath("/rides");
  revalidatePath("/m");
  return null;
}

export async function setPassengerStatus(
  passengerId: string,
  rideId: string,
  status: "confirmed" | "declined",
  _previousState: RideActionState,
  formData: FormData,
): Promise<RideActionState> {
  void formData;
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const [{ data: ride }, { data: passenger, error: passengerError }] = await Promise.all([
    supabase
      .from("rides")
      .select("driver_id,status")
      .eq("id", rideId)
      .single<{ driver_id: string; status: string }>(),
    supabase
      .from("ride_passengers")
      .select("passenger_id,status")
      .eq("id", passengerId)
      .eq("ride_id", rideId)
      .maybeSingle<{ passenger_id: string; status: string }>(),
  ]);
  if (!ride || ride.driver_id !== user.id) {
    return { error: "Only the driver can update passenger requests." };
  }
  if (ride.status !== "active") {
    return { error: "This ride is no longer active." };
  }
  if (passengerError) return { error: passengerError.message };
  if (!passenger || passenger.status !== "pending") {
    return { error: "This seat request is no longer pending." };
  }

  if (status === "confirmed") {
    const { data: confirmed, error } = await supabase.rpc("confirm_passenger", {
      p_passenger_id: passenger.passenger_id,
      p_ride_id: rideId,
    });
    if (error) return { error: error.message };
    if (!confirmed) return { error: "Could not confirm this passenger." };
  } else {
    const { data: declined, error } = await supabase
      .from("ride_passengers")
      .update({ status: "declined" })
      .eq("id", passengerId)
      .eq("ride_id", rideId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    if (!declined) return { error: "This seat request is no longer pending." };
  }

  revalidatePath(`/rides/${rideId}`);
  revalidatePath(`/m/rides/${rideId}`);
  revalidatePath("/rides");
  revalidatePath("/m");
  revalidateMessageRoutes();
  return null;
}

export async function cancelRide(
  rideId: string,
  reason: string,
  baseValue?: string,
): Promise<RedirectActionResult> {
  const trimmed = (reason ?? "").trim();
  const base = pickAllowed(baseValue, RIDE_LIST_TARGETS, "/rides");

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  let cancellationReason = trimmed;

  if (trimmed) {
    const { data: cancelled, error } = await supabase.rpc("cancel_ride", {
      p_ride_id: rideId,
      p_reason: trimmed,
    });
    if (error) {
      console.error("cancel_ride failed", { code: error.code, rideId });
      return { error: "We couldn't cancel this ride. Please try again." };
    }
    if (!cancelled) return { error: "Only the driver can cancel an active ride." };
  } else {
    const { data: ride, error: rideError } = await supabase
      .from("rides")
      .select("driver_id,status,seats_total,seats_available")
      .eq("id", rideId)
      .maybeSingle<{
        driver_id: string;
        status: string;
        seats_total: number;
        seats_available: number;
      }>();

    if (rideError) {
      console.error("cancel ride roster check failed", {
        code: rideError.code,
        rideId,
      });
      return { error: "We couldn't cancel this ride. Please try again." };
    }
    if (!ride || ride.driver_id !== user.id || ride.status !== "active") {
      return { error: "Only the driver can cancel an active ride." };
    }

    const emptyReason = emptyRideCancellationReason(
      ride.seats_total,
      ride.seats_available,
    );
    if (!emptyReason) {
      return { error: "Please tell your riders why the ride is cancelled." };
    }

    const { data: cancelled, error } = await supabase
      .from("rides")
      .update({
        status: "cancelled",
        cancellation_reason: emptyReason,
      })
      .eq("id", rideId)
      .eq("driver_id", user.id)
      .eq("status", "active")
      .eq("seats_total", ride.seats_total)
      .eq("seats_available", ride.seats_total)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      console.error("empty ride cancellation failed", {
        code: error.code,
        rideId,
      });
      return { error: "We couldn't cancel this ride. Please try again." };
    }
    if (!cancelled) {
      return { error: "Please tell your riders why the ride is cancelled." };
    }

    cancellationReason = emptyReason;
  }

  deferBestEffort(
    after,
    () =>
      sendRideCancellationSms({
        rideId,
        driverId: user.id,
        reason: cancellationReason,
      }),
    (deferredError) =>
      logDeferredCancellationError("ride", rideId, deferredError),
  );

  revalidatePath("/rides");
  revalidatePath("/m");
  revalidatePath(`/rides/${rideId}`);
  revalidatePath(`/m/rides/${rideId}`);
  revalidateMessageRoutes();
  return { success: true, redirectTo: base };
}

export async function closeRide(
  rideId: string,
  formData?: FormData,
): Promise<RedirectActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");
  const base = pickAllowed(formData?.get("base")?.toString(), RIDE_LIST_TARGETS, "/rides");

  const { data: closed, error } = await supabase.rpc("close_ride", {
    p_ride_id: rideId,
  });
  if (error) {
    console.error("close_ride failed", { code: error.code, rideId });
    return { error: "We couldn't close this ride. Please try again." };
  }
  if (!closed) return { error: "Only the driver can close an active ride." };

  revalidatePath("/rides");
  revalidatePath("/m");
  revalidateMessageRoutes();
  revalidatePath(`/rides/${rideId}`);
  revalidatePath(`/m/rides/${rideId}`);
  return { success: true, redirectTo: base };
}

export async function cancelSeat(
  rideId: string,
  message: string,
  baseValue?: string,
): Promise<RedirectActionResult> {
  const trimmed = (message ?? "").trim();
  const base = pickAllowed(baseValue, RIDE_LIST_TARGETS, "/rides");
  if (!trimmed) {
    return { error: "Please tell the driver why you are cancelling." };
  }

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  const { data: cancelled, error } = await supabase.rpc("cancel_seat", {
    p_ride_id: rideId,
    p_reason: trimmed,
  });
  if (error) {
    console.error("cancel_seat failed", { code: error.code, rideId });
    return { error: "We couldn't cancel your seat. Please try again." };
  }
  if (!cancelled) return { error: "You are not currently in this active ride." };

  deferBestEffort(
    after,
    () =>
      sendSeatCancellationSms({
        rideId,
        riderId: user.id,
        reason: trimmed,
      }),
    (deferredError) =>
      logDeferredCancellationError("seat", rideId, deferredError),
  );

  revalidatePath("/rides");
  revalidatePath("/m");
  revalidatePath(`/rides/${rideId}`);
  revalidatePath(`/m/rides/${rideId}`);
  revalidateMessageRoutes();
  return { success: true, redirectTo: rideDetailDestination(base, rideId) };
}
