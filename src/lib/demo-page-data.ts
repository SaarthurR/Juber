import type { EventBoard, EventSummary, MyEventRequest } from "@/lib/events";
import type { DemoState } from "@/lib/demo/types";
import {
  queryDemoEventRequests,
  queryDemoEvents,
  queryDemoRideRequests,
  queryDemoRides,
} from "@/lib/demo/queries";
import type {
  EventRow,
  Place,
  RideRequestWithRider,
  RideWithDriver,
} from "@/lib/types";

const dateOnly = (value: string | null) => value?.slice(0, 10) ?? null;

function normalizedEvent(event: EventRow): EventRow {
  return {
    ...event,
    start_date: dateOnly(event.start_date),
    end_date: dateOnly(event.end_date),
    source_url: null,
  };
}

function normalizedRequest(request: RideRequestWithRider): RideRequestWithRider {
  return {
    ...request,
    earliest_date: dateOnly(request.earliest_date),
    latest_date: dateOnly(request.latest_date),
  };
}

export function demoActiveRides(state: DemoState, limit?: number): RideWithDriver[] {
  const rides = queryDemoRides(state)
    .filter((ride) => ride.status === "active" && ride.depart_at >= state.now)
    .sort((a, b) => a.depart_at.localeCompare(b.depart_at));
  return limit === undefined ? rides : rides.slice(0, limit);
}

export function demoActiveRequests(state: DemoState): RideRequestWithRider[] {
  return demoRequests(state)
    .filter(
      (request) =>
        request.status === "active" &&
        (request.latest_date ?? request.depart_at.slice(0, 10)) >= state.seedDay,
    )
    .sort((a, b) => a.depart_at.localeCompare(b.depart_at));
}

export function demoRequests(state: DemoState): RideRequestWithRider[] {
  return queryDemoRideRequests(state).map(normalizedRequest);
}

export function demoRequest(
  state: DemoState,
  requestId: string,
): (RideRequestWithRider & { accepted_driver: DemoState["profiles"][string] | null }) | null {
  const request = demoRequests(state).find((item) => item.id === requestId);
  return request
    ? {
        ...request,
        accepted_driver: request.accepted_driver_id
          ? state.profiles[request.accepted_driver_id] ?? null
          : null,
      }
    : null;
}

export function demoPlaces(state: DemoState): Place[] {
  if (state.scenario === "read_error") {
    throw new Error("Simulated recoverable demo read error");
  }
  if (state.scenario === "empty") return [];
  return Object.values(state.places)
    .filter((place) => place.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function demoEvents(state: DemoState): EventRow[] {
  return queryDemoEvents(state)
    .map(normalizedEvent)
    .filter((event) => (event.end_date ?? event.start_date ?? "") >= state.seedDay)
    .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
}

export function demoEventSummaries(state: DemoState): EventSummary[] {
  const rides = demoActiveRides(state);
  const requests = demoActiveRequests(state);
  return demoEvents(state).map((event) => {
    const eventRides = rides.filter((ride) => ride.event_id === event.id);
    return {
      event,
      stats: {
        rides: eventRides.length,
        seats: eventRides.reduce((sum, ride) => sum + ride.seats_available, 0),
        requests: requests.filter((request) => request.event_id === event.id).length,
      },
    };
  });
}

export function demoMyEventRequests(
  state: DemoState,
  actorId: string,
  limit = 6,
): MyEventRequest[] {
  return queryDemoEventRequests(state)
    .filter((request) => request.requested_by === actorId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((request) => ({
      id: request.id,
      name: request.name,
      status: request.status,
      start_date: dateOnly(request.start_date),
      created_at: request.created_at,
      approved_event: request.approved_event_id
        ? { slug: state.events[request.approved_event_id]?.slug ?? "" }
        : null,
    }));
}

export function demoEventBoard(state: DemoState, slug: string): EventBoard | null {
  const event = demoEvents(state).find((item) => item.slug === slug);
  if (!event) return null;
  const rides = demoActiveRides(state).filter((ride) => ride.event_id === event.id);
  const requests = demoActiveRequests(state).filter(
    (request) => request.event_id === event.id,
  );
  return {
    event,
    rides,
    requests,
    stats: {
      rides: rides.length,
      seats: rides.reduce((sum, ride) => sum + ride.seats_available, 0),
      requests: requests.length,
    },
    publicOnly: false,
  };
}
