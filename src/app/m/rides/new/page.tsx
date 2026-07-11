import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getDateTimeInputValue } from "@/lib/date-time";
import { hasContact } from "@/lib/contact";
import { NewRideForm } from "@/components/new-ride-form";
import { SubHeader } from "@/components/mobile/sub-header";
import type { EventRow, Place } from "@/lib/types";

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

  const supabase = await createClient();
  if (!(await hasContact(supabase, user.id))) {
    redirect("/m/profile/edit?contact_required=1");
  }

  const minDepartDate = new Date();
  minDepartDate.setMinutes(minDepartDate.getMinutes() + 15);
  const minDepartAt = getDateTimeInputValue(minDepartDate);

  const [{ data: places }, { data: events }] = await Promise.all([
    supabase.from("places").select("*").eq("active", true),
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: true }),
  ]);

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      <SubHeader title="Post a ride" backFallback="/m/events" />
      <div className="px-4 pt-4">
        <NewRideForm
          events={(events as EventRow[]) ?? []}
          places={(places as Place[]) ?? []}
          defaultEventId={eventId ?? ""}
          minDepartAt={minDepartAt}
        />
      </div>
    </div>
  );
}
