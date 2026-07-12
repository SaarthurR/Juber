import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { hasContact } from "@/lib/contact-readiness";
import { contactSetupDestination } from "@/lib/route-targets";
import { RequestForm } from "@/components/request-form";
import type { EventRow, Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const eventId = Array.isArray(sp.event_id) ? sp.event_id[0] : sp.event_id;
  const today = new Date().toISOString().slice(0, 10);
  const { user } = await getCurrentUser();
  if (!user) redirect("/");

  const supabase = await createClient();
  if (!(await hasContact(supabase, user.id))) {
    const attempted = eventId ? `/requests/new?event_id=${eventId}` : "/requests/new";
    redirect(contactSetupDestination(attempted));
  }

  const [{ data: places }, { data: events }] = await Promise.all([
    supabase.from("places").select("*").eq("active", true),
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
      <h1 className="text-[34px] font-extrabold tracking-tight text-ink">Request a ride</h1>
      <div className="my-6 h-px bg-[#efece6]" />

      <RequestForm
        events={(events as EventRow[]) ?? []}
        places={(places as Place[]) ?? []}
        eventId={eventId}
        today={today}
      />
    </div>
  );
}
