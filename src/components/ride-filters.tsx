"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeftRight, Search, X } from "lucide-react";

export function RideFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hasFilters = Boolean(params.get("from") || params.get("to") || params.get("date"));

  function pushWith(values: { from?: string; to?: string; date?: string }) {
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
    });
  }

  function swap() {
    pushWith({
      from: params.get("to") ?? "",
      to: params.get("from") ?? "",
      date: params.get("date") ?? "",
    });
  }

  function clear() {
    const next = new URLSearchParams(params.toString());
    next.delete("from");
    next.delete("to");
    next.delete("date");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <form
      action={update}
      className="flex flex-wrap items-end gap-3.5 rounded-2xl border border-[#efe4d3] bg-white p-[18px] shadow-[0_24px_50px_-36px_rgba(92,59,46,0.4)]"
    >
      <Field label="From" name="from" defaultValue={params.get("from") ?? ""} placeholder="San Jose" />

      <button
        type="button"
        onClick={swap}
        aria-label="Swap from and to"
        className="hidden h-[50px] items-center justify-center pb-0.5 text-[#cdb593] transition hover:text-brand-600 sm:flex"
      >
        <ArrowLeftRight size={22} />
      </button>

      <Field label="To" name="to" defaultValue={params.get("to") ?? ""} placeholder="JCNC, Milpitas" />

      <label className="block min-w-[140px] flex-1">
        <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#a8927a]">
          Date
        </span>
        <input
          name="date"
          type="date"
          defaultValue={params.get("date") ?? ""}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-[50px] w-full rounded-xl border border-[#ead9c2] px-3.5 text-[15px] text-stone-700 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
      </label>

      {hasFilters && (
        <button
          type="button"
          onClick={clear}
          className="flex h-[50px] items-center justify-center gap-1.5 rounded-xl border border-[#ead9c2] px-4 text-sm font-bold text-[#a8927a] transition hover:border-brand-200 hover:bg-tint hover:text-brand-700"
        >
          <X size={16} />
          Clear
        </button>
      )}
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
    <label className="block min-w-[170px] flex-1">
      <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#a8927a]">
        {label}
      </span>
      <div className="relative">
        <input
          name={name}
          type="text"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="h-[50px] w-full rounded-xl border border-[#ead9c2] pl-3.5 pr-10 text-[15px] outline-none placeholder:text-[#b6a48c] focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#cdb593] transition hover:text-brand-600"
        >
          <Search size={18} />
        </button>
      </div>
    </label>
  );
}
