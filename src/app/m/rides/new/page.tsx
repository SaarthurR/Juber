import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getDateTimeInputValue } from "@/lib/date-time";
import { hasContact } from "@/lib/contact-readiness";
import { contactSetupDestination } from "@/lib/route-targets";
import { NewRideForm } from "@/components/new-ride-form";
import { SubHeader } from "@/components/mobile/sub-header";
import type { EventRow, Place } from "@/lib/types";
import { getDemoRuntime } from "@/lib/demo/runtime";
import { demoEvents, demoPlaces } from "@/lib/demo-page-data";

export const dynamic = "force-dynamic";

export default async function MobileNewRidePage({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const eventId = Array.isArray(sp.event_id) ? sp.event_id[0] : sp.event_id;
  const { user } = await getCurrentUser();
  if (!user) redirect("/m");

  const demo = await getDemoRuntime();

  const minDepartDate = new Date();
  minDepartDate.setMinutes(minDepartDate.getMinutes() + 15);
  const minDepartAt = getDateTimeInputValue(minDepartDate);

  let places: Place[];
  let events: EventRow[];
  if (demo) {
    const contact = demo.state.contacts[user.id];
    if (!contact?.phone && !contact?.whatsapp) {
      const attempted = eventId ? `/m/rides/new?event_id=${eventId}` : "/m/rides/new";
      redirect(contactSetupDestination(attempted, { mobile: true }));
    }
    places = demoPlaces(demo.state);
    events = demoEvents(demo.state);
  } else {
    const supabase = await createClient();
    if (!(await hasContact(supabase, user.id))) {
      const attempted = eventId ? `/m/rides/new?event_id=${eventId}` : "/m/rides/new";
      redirect(contactSetupDestination(attempted, { mobile: true }));
    }
    const [{ data: placeRows }, { data: eventRows }] = await Promise.all([
      supabase.from("places").select("*").eq("active", true),
      supabase.from("events").select("*").eq("is_active", true).order("start_date", { ascending: true }),
    ]);
    places = (placeRows as Place[]) ?? [];
    events = (eventRows as EventRow[]) ?? [];
  }

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      <SubHeader title="Post a ride" backFallback="/m/events" />
      <div className="px-4 pt-4">
        <NewRideForm
          events={events}
          places={places}
          defaultEventId={eventId ?? ""}
          minDepartAt={minDepartAt}
          base="/m"
        />
      </div>
    </div>
  );
}
