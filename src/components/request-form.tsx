"use client";

import { useActionState } from "react";
import { postRequest } from "@/app/rides/actions";
import { JCNC_LABEL } from "@/lib/constants";
import { COARSE_LABEL_HINT } from "@/lib/coarse-label";
import { FormField, PlacesDatalist, EventSelect, SubmitButton } from "@/components/form-bits";
import type { EventRow, Place } from "@/lib/types";

export function RequestForm({
  events,
  places,
  eventId,
  today,
}: {
  events: EventRow[];
  places: Place[];
  eventId?: string;
  today: string;
}) {
  const [state, formAction] = useActionState(postRequest, null);

  return (
    <form action={formAction} className="space-y-8">
      {state?.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {state.error}
        </p>
      )}
      <FormField
        label="Pick-up neighborhood"
        name="origin_label"
        required
        hint={`${COARSE_LABEL_HINT} Where should a driver collect you?`}
        placeholder="San Jose, Fremont, Sunnyvale..."
        list="places"
      />
      <FormField
        label="Where are you heading?"
        name="destination_label"
        required
        defaultValue={JCNC_LABEL}
        hint="City or neighborhood, not a street address."
        list="places"
      />

      <div>
        <p className="mb-1 text-[15px] font-bold text-ink">Date range that works for you</p>
        <p className="mb-3 text-[13px] text-[#a8a29e]">We&apos;ll match rides inside this window.</p>
        <div className="flex flex-wrap gap-3.5">
          <div className="min-w-[170px] flex-1">
            <FormField label="" name="earliest_date" type="date" min={today} required hint="Earliest" />
          </div>
          <div className="min-w-[170px] flex-1">
            <FormField label="" name="latest_date" type="date" min={today} required hint="Latest" />
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

      <EventSelect events={events} defaultValue={eventId ?? ""} />
      <FormField
        label="Notes for drivers"
        name="notes"
        textarea
        hint="Anything that helps someone match you"
        placeholder="Flexible on time during Paryushan week. Can meet near Westfield Oakridge."
      />
      <PlacesDatalist places={places} />
      <SubmitButton>Post ride request</SubmitButton>
    </form>
  );
}
