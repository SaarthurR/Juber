import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { postRequest } from "@/app/rides/actions";
import { JCNC_LABEL } from "@/lib/constants";
import { FormField, PlacesDatalist, EventSelect, SubmitButton } from "@/components/form-bits";
import type { EventRow, Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const { user } = await getCurrentUser();
  if (!user) redirect("/");

  const supabase = await createClient();
  const { data: places } = await supabase.from("places").select("*").eq("active", true);
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .order("start_date", { ascending: true });

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <h1 className="mb-1 text-2xl font-bold">Request a ride</h1>
      <p className="mb-6 text-stone-600">
        Tell drivers when you need a ride and how much you can spend.
      </p>

      <form action={postRequest} className="space-y-5">
        <FormField label="From" name="origin_label" required placeholder="Your city / neighborhood" list="places" />
        <FormField label="To" name="destination_label" required defaultValue={JCNC_LABEL} list="places" />
        <FormField label="Earliest Date" name="earliest_date" type="date" required />
        <FormField label="Latest Date" name="latest_date" type="date" required />
        <FormField label="Seats needed" name="seats_needed" type="number" min={1} defaultValue="1" required />
        <FormField label="Max price per seat (optional)" name="max_price" type="number" min={0} placeholder="Any price" />
        <EventSelect events={(events as EventRow[]) ?? []} />
        <FormField label="Notes (optional)" name="notes" textarea placeholder="Flexibility on timing, pickup spot, etc." />
        <PlacesDatalist places={(places as Place[]) ?? []} />
        <SubmitButton>Post request</SubmitButton>
      </form>
    </div>
  );
}
