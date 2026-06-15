import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { FormField, SubmitButton } from "@/components/form-bits";
import { createEvent, createPlace, deleteEvent, deletePlace } from "@/app/admin/actions";
import type { EventRow, Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, profile } = await getCurrentUser();
  if (!user || !profile?.is_admin) redirect("/");

  const supabase = await createClient();
  const { data: events } = await supabase.from("events").select("*").order("start_date");
  const { data: places } = await supabase.from("places").select("*").order("name");

  const eventList = (events as EventRow[]) ?? [];
  const placeList = (places as Place[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-3xl font-bold">Admin</h1>

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
