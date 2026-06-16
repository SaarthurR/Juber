import { redirect } from "next/navigation";
import { ChevronDown, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { postRequestMobile } from "@/app/m/actions";
import { SubHeader } from "@/components/mobile/sub-header";
import { DirectionToggle } from "@/components/mobile/direction-toggle";
import { Stepper } from "@/components/mobile/stepper";
import { MSubmitButton } from "@/components/mobile/m-submit";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-xl border border-border bg-white px-3.5 py-3 text-[14px] text-ink outline-none placeholder:text-muted-warm focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
      {children}
    </span>
  );
}

export default async function MobileNewRequestPage() {
  const { user } = await getCurrentUser();
  if (!user) redirect("/m");

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data: places } = await supabase
    .from("places")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  const neighborhoods = ((places as Place[]) ?? []).filter((p) => p.kind !== "event");
  const options = neighborhoods.length ? neighborhoods : ((places as Place[]) ?? []);

  return (
    <form action={postRequestMobile} className="pb-28">
      <SubHeader title="Request a ride" backFallback="/m/requests" />

      <div className="space-y-6 px-4 pt-2">
        <div>
          <h2 className="text-[17px] font-extrabold text-ink">Where are you heading?</h2>
          <p className="mt-1 text-[13px] text-muted-warm">
            Pick a direction — we&apos;ll match drivers going the same way.
          </p>
          <div className="mt-4">
            <DirectionToggle defaultDir="toJCNC" />
          </div>
        </div>

        <label className="block">
          <Label>Pick-up neighborhood</Label>
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
