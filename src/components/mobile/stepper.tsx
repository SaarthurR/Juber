"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * − value + stepper backing a hidden input, clamped between min and max.
 */
export function Stepper({
  name,
  defaultValue = 1,
  min = 1,
  max = 6,
}: {
  name: string;
  defaultValue?: number;
  min?: number;
  max?: number;
}) {
  const [value, setValue] = useState(defaultValue);

  function clamp(n: number) {
    return Math.max(min, Math.min(max, n));
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-white px-2 py-2">
      <input type="hidden" name={name} value={value} />
      <StepBtn label="Decrease" onClick={() => setValue((v) => clamp(v - 1))} disabled={value <= min}>
        <Minus size={18} strokeWidth={2.5} />
      </StepBtn>
      <span className="text-[17px] font-extrabold text-ink tabular-nums">{value}</span>
      <StepBtn label="Increase" onClick={() => setValue((v) => clamp(v + 1))} disabled={value >= max}>
        <Plus size={18} strokeWidth={2.5} />
      </StepBtn>
    </div>
  );
}

function StepBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-lg bg-tint text-brand-600 transition active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
