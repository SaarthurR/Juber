"use client";

import { useActionState } from "react";
import { ChevronDown, CalendarDays } from "lucide-react";
import { postRequestMobile } from "@/app/m/actions";
import { SubHeader } from "@/components/mobile/sub-header";
import { DirectionToggle } from "@/components/mobile/direction-toggle";
import { Stepper } from "@/components/mobile/stepper";
import { MSubmitButton } from "@/components/mobile/m-submit";
import type { Place } from "@/lib/types";

const inputCls =
  "w-full rounded-xl border border-border bg-white px-3.5 py-3 text-[14px] text-ink outline-none placeholder:text-muted-warm focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
      {children}
    </span>
  );
}

export function MobileRequestForm({
  options,
  today,
  eventId,
  eventName,
}: {
  options: Place[];
  today: string;
  eventId?: string;
  eventName?: string;
}) {
  const [state, formAction] = useActionState(postRequestMobile, null);

  return (
    <form action={formAction} className="pb-28">
      <SubHeader title="Request a ride" backFallback="/m/requests" />
      {eventId && <input type="hidden" name="event_id" value={eventId} />}

      <div className="space-y-6 px-4 pt-2">
        {state?.error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600">
            {state.error}
          </p>
        )}
        <div>
          <h2 className="text-[17px] font-extrabold text-ink">Where are you heading?</h2>
          <p className="mt-1 text-[13px] text-muted-warm">
            Pick a direction — we&apos;ll match drivers going the same way.
          </p>
          {eventName && (
            <p className="mt-3 rounded-xl bg-tint px-3 py-2 text-[12px] font-bold text-brand-700">
              This request will appear on the {eventName} ride board.
            </p>
          )}
          <div className="mt-4">
            <DirectionToggle defaultDir="toJCNC" />
          </div>
        </div>

        <label className="block">
          <Label>Pick-up neighborhood</Label>
          <p className="mb-2 text-[12px] leading-relaxed text-muted-warm">
            City or neighborhood, not a street address.
          </p>
          <div className="relative">
            <select name="neighborhood" required defaultValue="" className={`${inputCls} appearance-none pr-10`}>
              <option value="" disabled>
                Choose your neighborhood
              </option>
              {options.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={18}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-warm"
            />
          </div>
        </label>

        <div>
          <Label>Date range</Label>
          <div className="grid grid-cols-2 gap-3">
            <DateField name="earliest_date" min={today} placeholder="Earliest" />
            <DateField name="latest_date" min={today} placeholder="Latest" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Seats</Label>
            <Stepper name="seats_needed" defaultValue={1} min={1} max={6} />
          </div>
          <label className="block">
            <Label>Max gas</Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-muted-warm">
                $
              </span>
              <input
                name="max_price"
                type="number"
                min={0}
                placeholder="Any"
                className={`${inputCls} pl-7`}
              />
            </div>
          </label>
        </div>

        <label className="block">
          <Label>Notes for drivers</Label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Flexible on time during Paryushan. Can meet near Westfield Oakridge."
            className={`${inputCls} min-h-[88px] resize-none`}
          />
        </label>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-border-soft bg-cream px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <MSubmitButton>Post ride request</MSubmitButton>
      </div>
    </form>
  );
}

function DateField({
  name,
  min,
  placeholder,
}: {
  name: string;
  min: string;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-warm">{placeholder}</span>
      <CalendarDays
        size={16}
        className="pointer-events-none absolute right-3.5 top-[34px] text-muted-warm"
      />
      <input
        name={name}
        type="date"
        min={min}
        required
        className={`${inputCls} pr-9 [color-scheme:light]`}
      />
    </label>
  );
}
