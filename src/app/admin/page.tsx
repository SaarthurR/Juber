import { redirect } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { FormField, SubmitButton } from "@/components/form-bits";
import {
  approveEventRequest,
  createEvent,
  createPlace,
  deleteEvent,
  deleteEventRequest,
  deletePlace,
  importJcncEvents,
  rejectEventRequest,
} from "@/app/admin/actions";
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
          <form action={importJcncEvents}>
            <button className="rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-tint">
              Import JCNC events
            </button>
          </form>
        </div>

        {requestList.length ? (
          <div className="grid gap-3">
            {requestList.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_18px_44px_-36px_rgba(28,25,23,0.4)]"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-extrabold text-ink">{request.name}</h3>
                      {request.expected_traffic === "high" && (
                        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                          high traffic
                        </span>
                      )}
                      {request.source === "jcnc" && (
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">
                          JCNC import
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      {requestDates(request)}
                      {request.venue_label ? ` · ${request.venue_label}` : ""}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-stone-400">
                      Requested by {request.requester?.full_name ?? "Admin import"}
                    </p>
                    {request.description && (
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-stone-600">
                        {request.description}
                      </p>
                    )}
                    {request.source_url && (
                      <a
                        href={request.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-sm font-bold text-brand-600 hover:text-brand-700"
                      >
                        View source
                      </a>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                    <form action={approveEventRequest.bind(null, request.id)}>
                      <button className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700">
                        Approve
                      </button>
                    </form>
                    <form action={rejectEventRequest.bind(null, request.id)}>
                      <button className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:bg-stone-50">
                        Reject
                      </button>
                    </form>
                    <form action={deleteEventRequest.bind(null, request.id)}>
                      <button className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
            No pending event requests.
          </p>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Events */}
        <section>
          <h2 className="mb-4 text-lg font-bold">Create event</h2>
          <form action={createEvent} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
            <FormField label="Name" name="name" required placeholder="Paryushan 2026" />
            <FormField label="Venue" name="venue_label" placeholder="JCNC, Milpitas" />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Start date" name="start_date" type="date" />
              <FormField label="End date" name="end_date" type="date" />
            </div>
            <FormField label="Description" name="description" textarea />
            <SubmitButton>Add event</SubmitButton>
          </form>

          <ul className="mt-5 space-y-2">
            {eventList.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm">
                <span>{e.name}</span>
                <form action={deleteEvent.bind(null, e.id)}>
                  <button className="text-red-600 hover:underline">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        {/* Places */}
        <section>
          <h2 className="mb-4 text-lg font-bold">Add preset location</h2>
          <form action={createPlace} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
            <FormField label="Name" name="name" required placeholder="Fremont" />
            <FormField label="Address (optional)" name="address" />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">Kind</span>
              <select
                name="kind"
                defaultValue="neighborhood"
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              >
                <option value="neighborhood">Neighborhood</option>
                <option value="event">Event venue</option>
                <option value="hub">Hub</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">
                Link to event (optional)
              </span>
              <select
                name="event_id"
                defaultValue=""
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              >
                <option value="">— None —</option>
                {eventList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton>Add location</SubmitButton>
          </form>

          <ul className="mt-5 space-y-2">
            {placeList.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm">
                <span>
                  {p.name}{" "}
                  <span className="text-stone-400">({p.kind})</span>
                </span>
                <form action={deletePlace.bind(null, p.id)}>
                  <button className="text-red-600 hover:underline">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function requestDates(request: EventRequestWithRequester) {
  if (!request.start_date) return "Date TBD";
  const start = format(new Date(`${request.start_date}T12:00:00`), "MMM d");
  if (!request.end_date || request.end_date === request.start_date) return start;
  return `${start} - ${format(new Date(`${request.end_date}T12:00:00`), "MMM d")}`;
}
