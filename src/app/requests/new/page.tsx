import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
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
