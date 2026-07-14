import { JCNC_LABEL } from "@/lib/constants";
import { dateOnlyToIso } from "@/lib/date-time";
import { demoAddressSelection, demoRoute } from "@/lib/demo-addresses";
import type { DemoCommand, DemoSession } from "@/lib/demo/types";

function value(formData: FormData, name: string) {
  const result = formData.get(name)?.toString().trim() ?? "";
  return result || null;
}

function positiveInteger(formData: FormData, name: string, fallback: number, label: string) {
  const result = Number.parseInt(value(formData, name) ?? String(fallback), 10);
  if (!Number.isFinite(result) || result < 1) throw new Error(`${label} must be at least 1.`);
  return result;
}

function nonNegativeNumber(formData: FormData, name: string, label: string) {
  const raw = value(formData, name);
  if (!raw) return null;
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${label} must be 0 or more.`);
  return result;
}

function dateTime(formData: FormData, name: string) {
  const raw = value(formData, name);
  const result = raw ? new Date(raw) : null;
  if (!result || Number.isNaN(result.getTime())) throw new Error("Please choose a valid departure date and time.");
  return result.toISOString();
}

export function demoRideCommand(session: DemoSession, formData: FormData): DemoCommand {
  const direction = value(formData, "direction");
  const routePlace = value(formData, "route_place");
  const origin = direction === "from_jcnc" ? JCNC_LABEL : routePlace ?? value(formData, "origin_label");
  const destination = direction === "from_jcnc" ? routePlace ?? value(formData, "destination_label") : JCNC_LABEL;
  if (!origin || !destination) throw new Error("Please choose whether this ride is to or from JCNC and add the city.");
  const departAt = dateTime(formData, "depart_at");
  const roundTrip = value(formData, "round_trip") === "true";
  const returnDepartAt = roundTrip ? dateTime(formData, "return_depart_at") : null;
  if (returnDepartAt && new Date(returnDepartAt) <= new Date(departAt)) throw new Error("Return time must be after the outbound departure.");
  const eventId = value(formData, "event_id");
  if (eventId && !session.state.events[eventId]?.is_active) throw new Error("Please choose a live event, or select no specific event.");
  const contact = session.state.contacts[session.activeActorId];
  const meetupAddress = contact?.homeAddress ?? "3300 Capitol Ave, Fremont, CA 94538";
  const route = demoRoute(meetupAddress, "722 S Main St, Milpitas, CA 95035");
  const seats = positiveInteger(formData, "seats_total", 1, "Seats available");
  return {
    type: "post_ride",
    actorId: session.activeActorId,
    input: {
      origin_label: origin,
      destination_label: destination,
      depart_at: departAt,
      round_trip: roundTrip,
      return_depart_at: returnDepartAt,
      return_notes: roundTrip ? value(formData, "return_notes") : null,
      seats_total: seats,
      seats_available: seats,
      gas_contribution: nonNegativeNumber(formData, "gas_contribution", "Gas contribution"),
      notes: value(formData, "notes"),
      event_id: eventId,
      meetupAddress,
      meetupLat: contact?.homeLat ?? 37.5485,
      meetupLng: contact?.homeLng ?? -121.9886,
      routeDistanceMiles: route?.distanceMiles ?? 11.8,
      routeDurationMinutes: route?.durationMinutes ?? 18,
    },
  };
}

export function demoRequestCommand(session: DemoSession, formData: FormData, mobile = false): DemoCommand {
  const earliestDate = value(formData, "earliest_date");
  const latestDate = value(formData, "latest_date");
  if (!earliestDate) throw new Error("Please choose a start date.");
  if (!latestDate) throw new Error("Please choose an end date.");
  const earliest = dateOnlyToIso(earliestDate, "00:00");
  const latest = dateOnlyToIso(latestDate, "00:00");
  if (new Date(earliest) > new Date(latest)) throw new Error("The start date must be before the end date.");
  const direction = value(formData, "direction") ?? "toJCNC";
  const neighborhood = value(formData, "neighborhood");
  if (mobile && !neighborhood) throw new Error("Please choose your pick-up neighborhood.");
  const origin = mobile
    ? direction === "toJCNC" ? neighborhood : JCNC_LABEL
    : value(formData, "origin_label");
  const destination = mobile
    ? direction === "toJCNC" ? JCNC_LABEL : neighborhood
    : value(formData, "destination_label") ?? JCNC_LABEL;
  return {
    type: "post_request",
    actorId: session.activeActorId,
    input: {
      origin_label: origin ?? JCNC_LABEL,
      destination_label: destination ?? JCNC_LABEL,
      depart_at: dateOnlyToIso(earliestDate),
      earliest_date: earliestDate,
      latest_date: latestDate,
      max_price: nonNegativeNumber(formData, "max_price", mobile ? "Max gas" : "Max gas contribution"),
      seats_needed: positiveInteger(formData, "seats_needed", 1, mobile ? "Seats" : "Seats needed"),
      notes: value(formData, "notes"),
      event_id: value(formData, "event_id"),
    },
  };
}

export function demoProfileCommands(
  session: DemoSession,
  formData: FormData,
  fullName: string | null,
  mobile = false,
): [DemoCommand, DemoCommand] {
  const homeAddress = value(formData, "home_address");
  const previous = session.state.contacts[session.activeActorId]?.homeAddress ?? null;
  if (homeAddress && homeAddress !== previous && !demoAddressSelection(homeAddress)) {
    throw new Error("Choose your home address from the demo suggestions.");
  }
  const requestedContact = value(formData, "preferred_contact");
  const phone = value(formData, "phone");
  const whatsapp = value(formData, "whatsapp");
  const preferredContact = requestedContact === "phone" && !phone
    ? "whatsapp"
    : requestedContact === "whatsapp" && !whatsapp
      ? "phone"
      : requestedContact;
  const selection = homeAddress ? demoAddressSelection(homeAddress) : null;
  return [
    {
      type: "update_profile",
      actorId: session.activeActorId,
      values: {
        full_name: fullName,
        pronouns: value(formData, "pronouns"),
        neighborhood: value(formData, "neighborhood"),
        preferred_contact: preferredContact as "phone" | "whatsapp" | "message" | null,
        car_make_model: value(formData, "car_make_model"),
        ...(mobile ? {} : {
          car_color: value(formData, "car_color"),
          bio: value(formData, "bio"),
        }),
      },
    },
    {
      type: "update_contact",
      actorId: session.activeActorId,
      values: {
        phone,
        whatsapp,
        homeAddress,
        homeLat: selection ? 37.5485 : homeAddress === previous ? session.state.contacts[session.activeActorId]?.homeLat ?? null : null,
        homeLng: selection ? -121.9886 : homeAddress === previous ? session.state.contacts[session.activeActorId]?.homeLng ?? null : null,
      },
    },
  ];
}
