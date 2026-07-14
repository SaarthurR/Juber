import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { NewRideForm } from "@/components/new-ride-form";
import { getDateTimeInputValue } from "@/lib/date-time";
import { hasContact } from "@/lib/contact-readiness";
import { contactSetupDestination } from "@/lib/route-targets";
import type { EventRow, Place } from "@/lib/types";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { demoEvents, demoPlaces } from "@/lib/demo-page-data";

export const dynamic = "force-dynamic";

export default async function NewRidePage({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const eventId = Array.isArray(sp.event_id) ? sp.event_id[0] : sp.event_id;
  const minDepartDate = new Date();
  minDepartDate.setMinutes(minDepartDate.getMinutes() + 15);
  const minDepartAt = getDateTimeInputValue(minDepartDate);
  const { user } = await getCurrentUser();
  if (!user) redirect("/");

  const demo = await getDemoRuntime();
  let places: Place[];
  let events: EventRow[];
  if (demo) {
    const contact = demo.state.contacts[user.id];
    if (!contact?.phone && !contact?.whatsapp) {
      const attempted = eventId ? `/rides/new?event_id=${eventId}` : "/rides/new";
      redirect(contactSetupDestination(attempted));
    }
    places = demoPlaces(demo.state);
    events = demoEvents(demo.state);
  } else {
    const supabase = await createClient();
    if (!(await hasContact(supabase, user.id))) {
      const attempted = eventId ? `/rides/new?event_id=${eventId}` : "/rides/new";
      redirect(contactSetupDestination(attempted));
    }
    const [{ data: placeRows }, { data: eventRows }] = await Promise.all([
      supabase.from("places").select("*").eq("active", true),
      supabase.from("events").select("*").eq("is_active", true).order("start_date", { ascending: true }),
    ]);
    places = (placeRows as Place[]) ?? [];
    events = (eventRows as EventRow[]) ?? [];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-4xl font-black tracking-tight text-stone-900 sm:text-5xl">
        New Carpool
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-stone-600">
        Share your seats with the sangha. One car instead of four - that&apos;s ahimsa.
      </p>

      <div className="mt-8">
        <NewRideForm
          events={events}
          places={places}
          defaultEventId={eventId ?? ""}
          minDepartAt={minDepartAt}
        />
      </div>
    </div>
  );
}
