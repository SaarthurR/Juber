"use client";

import { useActionState } from "react";
import { CalendarPlus } from "lucide-react";
import { requestEvent } from "@/app/events/actions";
import { GoogleSignInButton } from "@/components/auth-button";
import { FormField, SubmitButton } from "@/components/form-bits";
import {
  EVENT_REQUEST_INITIAL_STATE,
  type EventRequestActionState,
} from "@/lib/event-request-state";

export function EventRequestForm({
  signedIn,
  compact = false,
  initialState = EVENT_REQUEST_INITIAL_STATE,
}: {
  signedIn: boolean;
  compact?: boolean;
  initialState?: EventRequestActionState;
}) {
  const [state, formAction] = useActionState(requestEvent, initialState);
  const messageClass =
    state.status === "success"
      ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
      : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700";

  return (
    <section className={compact ? "px-4 pt-4" : "mt-8"}>
      <div className="rounded-2xl border border-[#e7ddcf] bg-white p-5 shadow-[0_18px_44px_-34px_rgba(92,59,46,0.5)]">
        {state.message && (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={`mb-4 ${messageClass}`}
          >
            {state.message}
          </p>
        )}

        <details key={state.resetKey} className="group">
          <summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-100">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint text-brand-600">
              <CalendarPlus size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={compact ? "block text-[16px] font-extrabold text-ink" : "block text-lg font-extrabold text-ink"}>
                Don&apos;t see your event? Request a ride board
              </span>
              <span className={compact ? "mt-1 block text-[12px] leading-relaxed text-muted-warm" : "mt-1 block text-sm leading-relaxed text-stone-500"}>
                Tell admins what gathering needs a ride board. Once approved, it appears here.
              </span>
            </span>
            <span className="pt-1 text-xs font-bold text-brand-600 group-open:hidden">Expand</span>
            <span className="hidden pt-1 text-xs font-bold text-brand-600 group-open:inline">Close</span>
          </summary>

          {signedIn ? (
            <form action={formAction} className="mt-5 space-y-4">
              <FormField label="Event name" name="name" required placeholder="Mahavir Janma Kalyanak" />
              <FormField label="Venue" name="venue_label" placeholder="JCNC, Milpitas" />
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Start" name="start_date" type="date" />
                <FormField label="End" name="end_date" type="date" />
              </div>
              <label className="block">
                <span className="mb-1 block text-[15px] font-bold text-ink">Expected traffic</span>
                <select
                  name="expected_traffic"
                  defaultValue="unsure"
                  className="w-full rounded-xl border border-[#e2ddd5] px-3.5 py-3 text-[15px] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="unsure">Not sure</option>
                  <option value="high">Likely high traffic</option>
                </select>
              </label>
              <FormField
                label="Event link (optional)"
                name="source_url"
                type="url"
                placeholder="https://example.org/event"
              />
              <FormField
                label="Why add it?"
                name="description"
                textarea
                placeholder="Include timing, audience size, or why ride sharing will help."
              />
              <SubmitButton>Submit for approval</SubmitButton>
            </form>
          ) : (
            <div className="mt-5">
              <GoogleSignInButton
                next={compact ? "/m/events" : "/events"}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]"
              />
            </div>
          )}
        </details>
      </div>
    </section>
  );
}
