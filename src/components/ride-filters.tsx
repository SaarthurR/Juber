"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeftRight, Search } from "lucide-react";

export function RideFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pushWith(values: { from?: string; to?: string; date?: string }) {
    const next = new URLSearchParams(params.toString());
    for (const [key, raw] of Object.entries(values)) {
      const v = (raw ?? "").toString().trim();
      if (v) next.set(key, v);
      else next.delete(key);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  function update(formData: FormData) {
    pushWith({
      from: formData.get("from")?.toString(),
      to: formData.get("to")?.toString(),
      date: formData.get("date")?.toString(),
    });
  }

  function swap() {
    pushWith({
      from: params.get("to") ?? "",
      to: params.get("from") ?? "",
      date: params.get("date") ?? "",
    });
  }

  return (
    <form
      action={update}
      className="grid items-end gap-x-4 gap-y-3 sm:grid-cols-[1fr_auto_1fr_1fr]"
    >
      <Field label="From" name="from" defaultValue={params.get("from") ?? ""} placeholder="City, State" />

      <button
        type="button"
        onClick={swap}
        aria-label="Swap from and to"
        className="mx-auto hidden h-[46px] items-center justify-center text-stone-400 transition hover:text-stone-700 sm:flex"
      >
        <ArrowLeftRight size={20} />
      </button>

      <Field label="To" name="to" defaultValue={params.get("to") ?? ""} placeholder="City, State" />

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-stone-900">
          Date
        </span>
        <input
          name="date"
          type="date"
          defaultValue={params.get("date") ?? ""}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-[46px] w-full rounded-lg border border-stone-300 px-3 text-sm text-stone-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-stone-900">
        {label}
      </span>
      <div className="relative">
        <input
          name={name}
          type="text"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="h-[46px] w-full rounded-lg border border-stone-300 pl-3 pr-10 text-sm outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 transition hover:text-stone-700"
        >
          <Search size={18} />
        </button>
      </div>
    </label>
  );
}
