"use client";

import { useFormStatus } from "react-dom";
import type { EventRow, Place } from "@/lib/types";

export function FormField({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
  min,
  list,
  textarea,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  min?: number;
  list?: string;
  textarea?: boolean;
}) {
  const cls =
    "w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {textarea ? (
        <textarea name={name} placeholder={placeholder} rows={3} className={cls} />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          min={min}
          list={list}
          className={cls}
        />
      )}
    </label>
  );
}

export function EventSelect({ events }: { events: EventRow[] }) {
  if (!events.length) return null;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">
        Event (optional)
      </span>
      <select
        name="event_id"
        defaultValue=""
        className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">— None —</option>
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlacesDatalist({ places }: { places: Place[] }) {
  return (
    <datalist id="places">
      {places.map((p) => (
        <option key={p.id} value={p.name} />
      ))}
    </datalist>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-600 px-5 py-3.5 font-semibold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
