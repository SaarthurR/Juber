import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { postRide } from "@/app/rides/actions";
import { JCNC_LABEL } from "@/lib/constants";
import { FormField, PlacesDatalist, EventSelect, SubmitButton } from "@/components/form-bits";
import type { EventRow, Place } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewRidePage() {
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
      <h1 className="text-3xl font-bold text-stone-900">Post a Ride</h1>
      <hr className="my-5 border-stone-200" />
      <p className="mb-7 text-stone-600">
        Share your seats with the sangha. One car instead of four — that&apos;s ahimsa.
      </p>

      <form action={postRide} className="space-y-5">
        <FormField label="From" name="origin_label" required placeholder="Your city / neighborhood" list="places" />
        <FormField label="To" name="destination_label" required defaultValue={JCNC_LABEL} list="places" />
        <FormField label="Departure" name="depart_at" type="datetime-local" required />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Seats available" name="seats_total" type="number" min={1} defaultValue="3" required />
          <FormField label="Gas / seat ($, optional)" name="gas_contribution" type="number" min={0} placeholder="0" />
        </div>
        <EventSelect events={(events as EventRow[]) ?? []} />
        <FormField label="Notes (optional)" name="notes" textarea placeholder="Pickup details, return trip, etc." />
        <PlacesDatalist places={(places as Place[]) ?? []} />
        <SubmitButton>Post ride</SubmitButton>
      </form>
    </div>
  );
}
