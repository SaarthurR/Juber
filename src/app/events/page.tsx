import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/event-card";
import type { EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .order("start_date", { ascending: true });

  const list = (events as EventRow[]) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold">Events</h1>
      <p className="mb-8 text-stone-600">
        Carpool boards for JCNC gatherings. Find your event and grab a ride.
      </p>

      {list.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {list.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
          No events yet. Check back soon!
        </p>
      )}
    </div>
  );
}
