import "server-only";

import { createClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/sms";

type CancellationContact = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

function createCancellationClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server key is not configured for cancellation SMS");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
}

async function loadContacts(userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return [] as CancellationContact[];

  const supabase = createCancellationClient();
  const [profilesResult, contactsResult] = await Promise.all([
    supabase.from("profiles").select("id,full_name").in("id", ids),
    supabase.from("profile_contacts").select("user_id,phone").in("user_id", ids),
  ]);

  if (profilesResult.error || contactsResult.error) {
    throw new Error("Could not load cancellation contacts");
  }

  const phonesById = new Map(
    (contactsResult.data ?? []).map((contact) => [contact.user_id, contact.phone]),
  );

  return (profilesResult.data ?? []).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    phone: phonesById.get(profile.id) ?? null,
  }));
}

async function sendCancellationTexts(
  messages: Array<Parameters<typeof sendSms>[0]>,
  context: { rideId: string; kind: "ride" | "seat" },
) {
  const results = await Promise.allSettled(messages.map(sendSms));

  results.forEach((result, index) => {
    if (result.status === "rejected" || result.value === false) {
      console.error("Cancellation SMS failed", {
        rideId: context.rideId,
        kind: context.kind,
        index,
      });
    }
  });
}

export async function sendRideCancellationSms({
  rideId,
  driverId,
  reason,
}: {
  rideId: string;
  driverId: string;
  reason: string;
}) {
  const supabase = createCancellationClient();
  const [rideResult, passengersResult] = await Promise.all([
    supabase
      .from("rides")
      .select("driver_id,origin_label,destination_label")
      .eq("id", rideId)
      .maybeSingle<{
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

  if (
    rideResult.error ||
    passengersResult.error ||
    !rideResult.data ||
    rideResult.data.driver_id !== driverId
  ) {
    throw new Error("Could not load cancelled ride SMS context");
  }

  const passengerIds =
    passengersResult.data?.map((passenger) => passenger.passenger_id) ?? [];
  if (!passengerIds.length) return;

  const contacts = await loadContacts([driverId, ...passengerIds]);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const driverName = contactsById.get(driverId)?.full_name?.trim() || "Your driver";
  const route = `${rideResult.data.origin_label} to ${rideResult.data.destination_label}`;

  await sendCancellationTexts(
    passengerIds.map((passengerId) => ({
      to: contactsById.get(passengerId)?.phone ?? null,
      body: `${driverName} cancelled your ride from ${route}. Reason: ${reason}`,
    })),
    { rideId, kind: "ride" },
  );
}

export async function sendSeatCancellationSms({
  rideId,
  riderId,
  reason,
}: {
  rideId: string;
  riderId: string;
  reason: string;
}) {
  const supabase = createCancellationClient();
  const { data: ride, error } = await supabase
    .from("rides")
    .select("driver_id,origin_label,destination_label")
    .eq("id", rideId)
    .maybeSingle<{
      driver_id: string;
      origin_label: string;
      destination_label: string;
    }>();

  if (error || !ride) {
    throw new Error("Could not load cancelled seat SMS context");
  }

  const contacts = await loadContacts([riderId, ride.driver_id]);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const riderName = contactsById.get(riderId)?.full_name?.trim() || "A rider";
  const route = `${ride.origin_label} to ${ride.destination_label}`;

  await sendCancellationTexts(
    [
      {
        to: contactsById.get(ride.driver_id)?.phone ?? null,
        body: `${riderName} cancelled their seat for your ride from ${route}. Reason: ${reason}`,
      },
    ],
    { rideId, kind: "seat" },
  );
}
