import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { hasContact } from "@/lib/contact-readiness";
import { contactSetupDestination } from "@/lib/route-targets";
import { MobileRequestForm } from "@/components/mobile/request-form";
import type { EventRow, Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MobileNewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const eventId = Array.isArray(sp.event_id) ? sp.event_id[0] : sp.event_id;
  const { user } = await getCurrentUser();
  if (!user) redirect("/m");

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  if (!(await hasContact(supabase, user.id))) {
    const attempted = eventId ? `/m/requests/new?event_id=${eventId}` : "/m/requests/new";
    redirect(contactSetupDestination(attempted, { mobile: true }));
  }

  const [{ data: places }, { data: events }] = await Promise.all([
    supabase
      .from("places")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    eventId
      ? supabase.from("events").select("id,name,slug").eq("id", eventId).single()
      : Promise.resolve({ data: null }),
  ]);

  const neighborhoods = ((places as Place[]) ?? []).filter((p) => p.kind !== "event");
  const options = neighborhoods.length ? neighborhoods : ((places as Place[]) ?? []);
  const event = events as Pick<EventRow, "id" | "name" | "slug"> | null;

  return <MobileRequestForm options={options} today={today} eventId={event?.id} eventName={event?.name} />;
}
