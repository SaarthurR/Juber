import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { AdminModerationPanel } from "@/components/admin-moderation-panel";
import {
  AdminCreateEventForm,
  AdminCreatePlaceForm,
  AdminDeleteEventButton,
  AdminDeletePlaceButton,
} from "@/components/admin-forms";
import { loadAdminModerationQueue } from "@/lib/moderation-server";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MobileAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string | string[] }>;
}) {
  const { report } = await searchParams;
  const supabase = await createClient();
  const [queue, { data: events }, { data: places }] = await Promise.all([
    loadAdminModerationQueue(report),
    supabase.from("events").select("*").order("start_date"),
    supabase.from("places").select("*").order("name"),
  ]);
  const eventList = (events as EventRow[]) ?? [];
  const placeList = (places as Place[]) ?? [];

  return (
    <div className="px-4 pb-28 pt-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Admin</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">Moderation queue</h1>
        <p className="mt-2 text-sm text-stone-500">
          Review reports and appeals on mobile.
        </p>
        <Link href="/m" className="mt-3 inline-block text-sm font-bold text-brand-600">
          Back to rides
        </Link>
      </div>

      <AdminModerationPanel
        key={queue.selectedReport?.id ?? "none"}
        reports={queue.reports}
        appeals={queue.appeals}
        error={queue.error}
        initialReport={queue.selectedReport}
      />

      <div className="mt-8 space-y-6">
        <section>
          <details className="rounded-2xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-base font-extrabold">
              Create event
            </summary>
            <div className="border-t border-stone-100 p-4">
              <AdminCreateEventForm />
            </div>
          </details>
          <ul className="mt-3 space-y-2">
            {eventList.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <span>{event.name}</span>
                <AdminDeleteEventButton eventId={event.id} />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <details className="rounded-2xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-base font-extrabold">
              Add preset location
            </summary>
            <div className="border-t border-stone-100 p-4">
              <AdminCreatePlaceForm events={eventList} />
            </div>
          </details>
          <ul className="mt-3 space-y-2">
            {placeList.map((place) => (
              <li
                key={place.id}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <span>
                  {place.name} <span className="text-stone-400">({place.kind})</span>
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
