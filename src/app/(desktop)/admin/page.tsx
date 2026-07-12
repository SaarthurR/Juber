import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  AdminCreateEventForm,
  AdminCreatePlaceForm,
  AdminDeleteEventButton,
  AdminDeletePlaceButton,
  AdminEventRequestCard,
  AdminJcncImportForm,
} from "@/components/admin-forms";
import type { EventRequestWithRequester, EventRow, Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, profile } = await getCurrentUser();
  if (!user || !profile?.is_admin) redirect("/");

  const supabase = await createClient();
  const [{ data: events }, { data: places }, { data: eventRequests }] =
    await Promise.all([
      supabase.from("events").select("*").order("start_date"),
      supabase.from("places").select("*").order("name"),
      supabase
        .from("event_requests")
        .select("*, requester:profiles!event_requests_requested_by_fkey(id,full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const eventList = (events as EventRow[]) ?? [];
  const placeList = (places as Place[]) ?? [];
  const requestList = (eventRequests as EventRequestWithRequester[]) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-3xl font-bold">Admin</h1>

      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Event requests</h2>
            <p className="mt-1 text-sm text-stone-500">
              Approve user suggestions or import likely high-traffic JCNC calendar items.
            </p>
          </div>
          <AdminJcncImportForm />
        </div>

        {requestList.length ? (
          <div className="grid gap-3">
            {requestList.map((request) => (
              <AdminEventRequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
            No pending event requests.
          </p>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-4 text-lg font-bold">Create event</h2>
          <AdminCreateEventForm />

          <ul className="mt-5 space-y-2">
            {eventList.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm"
              >
                <span>{event.name}</span>
                <AdminDeleteEventButton eventId={event.id} />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-bold">Add preset location</h2>
          <AdminCreatePlaceForm events={eventList} />

          <ul className="mt-5 space-y-2">
            {placeList.map((place) => (
              <li
                key={place.id}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm"
              >
                <span>
                  {place.name}{" "}
                  <span className="text-stone-400">({place.kind})</span>
                </span>
                <AdminDeletePlaceButton placeId={place.id} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
