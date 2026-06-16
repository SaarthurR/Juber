"use client";

/**
 * The JCNC segmented control used across the mobile system (Home toggle, trunk
 * size, profile tabs). Track is `seg-track`; the active segment is a white pill
 * with brand text and a soft shadow.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-[13px] bg-seg-track p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-[10px] px-3 py-2.5 text-[13px] font-bold transition ${
              active
                ? "bg-white text-brand-600 shadow-[0_2px_6px_-2px_rgba(28,25,23,0.18)]"
                : "text-[#8a7256]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
