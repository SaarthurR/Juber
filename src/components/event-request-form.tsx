import { CalendarPlus } from "lucide-react";
import { requestEvent } from "@/app/events/actions";
import { GoogleSignInButton } from "@/components/auth-button";
import { FormField, SubmitButton } from "@/components/form-bits";

export function EventRequestForm({
  signedIn,
  compact = false,
}: {
  signedIn: boolean;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "px-4 pt-4" : "mt-8"}>
      <div className="rounded-2xl border border-[#e7ddcf] bg-white p-5 shadow-[0_18px_44px_-34px_rgba(92,59,46,0.5)]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint text-brand-600">
            <CalendarPlus size={20} />
          </span>
          <div>
            <h2 className={compact ? "text-[16px] font-extrabold text-ink" : "text-lg font-extrabold text-ink"}>
              Request an event board
            </h2>
            <p className={compact ? "mt-1 text-[12px] leading-relaxed text-muted-warm" : "mt-1 text-sm leading-relaxed text-stone-500"}>
              Tell admins what gathering needs carpools. Once approved, it appears here with its own ride board.
            </p>
          </div>
        </div>

        {signedIn ? (
          <form action={requestEvent} className="mt-5 space-y-4">
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
              label="Why add it?"
              name="description"
              textarea
              placeholder="Include timing, audience size, or why carpools will help."
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
      </div>
    </section>
  );
}
