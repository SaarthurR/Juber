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
    <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
      <h1 className="text-[34px] font-extrabold tracking-tight text-ink">Request a ride</h1>
      <div className="my-6 h-px bg-[#efece6]" />

      <form action={postRequest} className="space-y-8">
        <FormField
          label="Pick-up neighborhood"
          name="origin_label"
          required
          hint="Where should a driver collect you?"
          placeholder="San Jose, Fremont, Sunnyvale…"
          list="places"
        />
        <FormField
          label="Where are you heading?"
          name="destination_label"
          required
          defaultValue={JCNC_LABEL}
          list="places"
        />

        <div>
          <p className="mb-1 text-[15px] font-bold text-ink">Date range that works for you</p>
          <p className="mb-3 text-[13px] text-[#a8a29e]">We&apos;ll match rides inside this window.</p>
          <div className="flex flex-wrap gap-3.5">
            <div className="min-w-[170px] flex-1">
              <FormField label="" name="earliest_date" type="date" required hint="Earliest" />
            </div>
            <div className="min-w-[170px] flex-1">
              <FormField label="" name="latest_date" type="date" required hint="Latest" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-10 gap-y-8">
          <div className="min-w-[200px] flex-1">
            <FormField
              label="Seats needed"
              name="seats_needed"
              type="number"
              min={1}
              defaultValue="1"
              required
              hint="Including yourself"
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <FormField
              label="Max gas contribution"
              name="max_price"
              type="number"
              min={0}
              placeholder="Any price"
              hint="Only rides at or below match"
            />
          </div>
        </div>

        <EventSelect events={(events as EventRow[]) ?? []} />
        <FormField
          label="Notes for drivers"
          name="notes"
          textarea
          hint="Anything that helps someone match you"
          placeholder="Flexible on time during Paryushan week. Can meet near Westfield Oakridge."
        />
        <PlacesDatalist places={(places as Place[]) ?? []} />
        <SubmitButton>Post ride request</SubmitButton>
      </form>
    </div>
  );
}
