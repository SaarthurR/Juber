"use client";

import { useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeftRight, Search, X } from "lucide-react";
import { CityCombobox } from "@/components/city-combobox";

export function RideFilters() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tripFilter = params.get("trip");
  const requestedDate = params.get("date");
  const selectedDate = requestedDate === "all" ? "" : requestedDate ?? "";

  function pushWith(values: { from?: string; to?: string; date?: string; trip?: string }) {
    const next = new URLSearchParams(params.toString());
    for (const [key, raw] of Object.entries(values)) {
      const v = (raw ?? "").toString().trim();
      if (v) next.set(key, v);
      else next.delete(key);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function update(formData: FormData) {
    pushWith({
      from: formData.get("from")?.toString(),
      to: formData.get("to")?.toString(),
      date: formData.get("date")?.toString(),
      trip: formData.get("trip")?.toString(),
    });
  }

  function swap() {
    const form = formRef.current;
    const currentFrom = (form?.elements.namedItem("from") as HTMLInputElement | null)?.value ?? "";
    const currentTo = (form?.elements.namedItem("to") as HTMLInputElement | null)?.value ?? "";

    pushWith({
      from: currentTo,
      to: currentFrom,
    });
  }

  return (
    <form
      ref={formRef}
      action={update}
      className="rounded-2xl border border-[#efe4d3] bg-white p-4 shadow-[0_24px_50px_-36px_rgba(92,59,46,0.4)] sm:p-5"
    >
      <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_42px_minmax(0,1fr)_minmax(170px,0.8fr)]">
        <Field label="From">
          <CityCombobox
            key={`from-${params.get("from") ?? ""}`}
            name="from"
            ariaLabel="From city or neighborhood"
            defaultValue={params.get("from") ?? ""}
            placeholder="City or neighborhood"
            inputClassName={fieldClassName}
          />
        </Field>

        <button
          type="button"
          onClick={swap}
          aria-label="Swap from and to"
          className="flex h-10 w-10 items-center justify-center justify-self-center rounded-full bg-tint text-brand-600 transition hover:bg-brand-100 active:scale-95 md:mb-1 md:h-[46px] md:w-[42px]"
        >
          <ArrowLeftRight size={20} />
        </button>

        <Field label="To">
          <CityCombobox
            key={`to-${params.get("to") ?? ""}`}
            name="to"
            ariaLabel="To city or neighborhood"
            defaultValue={params.get("to") ?? ""}
            placeholder="City or neighborhood"
            inputClassName={fieldClassName}
          />
        </Field>

        <Field label="Date">
          <div className="relative">
            <input
              key={selectedDate || "all"}
              name="date"
              aria-label="Ride date"
              type="date"
              defaultValue={selectedDate}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className={`${dateFieldClassName} ${selectedDate ? "pr-14 [&::-webkit-calendar-picker-indicator]:opacity-0" : "px-3.5"}`}
            />
            {selectedDate && (
              <button
                type="button"
                onClick={() => pushWith({ date: "" })}
                aria-label="Clear date and show rides on all dates"
                className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-500 transition hover:bg-tint hover:text-brand-700"
              >
                <X size={19} strokeWidth={2.3} />
              </button>
            )}
          </div>
        </Field>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <TripButton label="One way" value="one" active={tripFilter === "one"} onSelect={pushWith} />
          <TripButton label="Round trip" value="round" active={tripFilter === "round"} onSelect={pushWith} />
          {tripFilter && (
            <button
              type="button"
              onClick={() => pushWith({ trip: "" })}
              aria-label="Clear trip type"
              className="col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-[#9b846c] transition hover:bg-tint hover:text-brand-700 sm:col-span-1"
            >
              <X size={15} strokeWidth={2.4} />
              Clear
            </button>
          )}
        </div>
        <button
          type="submit"
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-[0.98]"
        >
          <Search size={17} strokeWidth={2.5} />
          Search rides
        </button>
      </div>
    </form>
  );
}

const fieldClassName =
  "h-[52px] w-full rounded-xl border border-[#dfcdb5] bg-white pl-4 pr-11 text-[15px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-[#b6a48c] focus:border-brand-600 focus:ring-2 focus:ring-brand-100";
const dateFieldClassName =
  "h-[52px] w-full rounded-xl border border-[#dfcdb5] bg-white text-[15px] font-semibold text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

function TripButton({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: "one" | "round";
  active: boolean;
  onSelect: (values: { trip?: string }) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect({ trip: active ? "" : value })}
      className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-[#ead9c2] bg-white text-[#7b6650] hover:bg-tint"
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block min-w-0">
      <span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#8f7962]">
        {label}
      </span>
      {children}
    </div>
  );
}
