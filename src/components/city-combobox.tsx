"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { CITY_SUGGESTIONS, JCNC_LABEL } from "@/lib/constants";

const CITY_OPTIONS = [JCNC_LABEL, ...CITY_SUGGESTIONS];

export function CityCombobox({
  name,
  value,
  defaultValue = "",
  onValueChange,
  ariaLabel,
  placeholder = "City or neighborhood",
  inputClassName = "",
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  inputClassName?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const currentValue = value ?? internalValue;
  const query = currentValue.trim().toLocaleLowerCase();
  const options = filtering
    ? CITY_OPTIONS.filter((city) => city.toLocaleLowerCase().includes(query))
    : CITY_OPTIONS;

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function update(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        name={name}
        value={currentValue}
        onChange={(event) => {
          update(event.target.value);
          setFiltering(true);
          setOpen(true);
        }}
        onFocus={() => {
          setFiltering(false);
          setOpen(true);
        }}
        onClick={() => {
          setFiltering(false);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") setOpen(true);
        }}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id}
        autoComplete="off"
        placeholder={placeholder}
        className={inputClassName}
      />
      <Search
        size={19}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#b9a58b]"
      />

      {open && (
        <div
          id={id}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-y-auto rounded-xl border border-[#ead9c2] bg-white p-1.5 shadow-[0_18px_45px_-20px_rgba(92,59,46,0.5)]"
        >
          {options.length ? (
            options.map((city) => (
              <button
                key={city}
                type="button"
                data-auth-allowed="true"
                role="option"
                aria-selected={city === currentValue}
                onClick={() => {
                  update(city);
                  setFiltering(false);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14px] font-semibold text-ink transition hover:bg-tint active:bg-brand-100"
              >
                {city}
                {city === currentValue && <Check size={16} className="text-brand-600" />}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-[13px] text-muted-warm">
              Keep typing to use a custom location.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
