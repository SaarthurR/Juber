"use client";

import { useId, useState } from "react";
import {
  DEMO_ADDRESS_PATTERN,
  demoAddressSelection,
  demoAddressSuggestions,
  isDemoAddressSelectionValid,
} from "@/lib/demo-addresses";

export function DemoPlaceInput({
  name,
  initialValue = "",
  placeholder,
  label,
  maxLength = 500,
  required = false,
  className,
  ariaDescribedBy,
}: {
  name: string;
  initialValue?: string;
  placeholder: string;
  label: string;
  maxLength?: number;
  required?: boolean;
  className: string;
  ariaDescribedBy?: string;
}) {
  const listId = useId();
  const helpId = useId();
  const [value, setValue] = useState(initialValue);
  const [showError, setShowError] = useState(false);
  const selection = demoAddressSelection(value);
  const invalid = !isDemoAddressSelectionValid(value, required);
  const describedBy = [ariaDescribedBy, helpId].filter(Boolean).join(" ");

  return (
    <>
      <input
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setShowError(false);
        }}
        onBlur={() => setShowError(invalid)}
        onInvalid={() => setShowError(true)}
        list={listId}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={showError && invalid}
        aria-errormessage={showError && invalid ? helpId : undefined}
        placeholder={placeholder}
        maxLength={maxLength}
        pattern={DEMO_ADDRESS_PATTERN}
        required={required}
        autoComplete="off"
        title="Choose one of the available demo addresses."
        className={className}
      />
      <input type="hidden" name={`${name}_place_id`} value={selection?.placeId ?? ""} readOnly />
      <input type="hidden" name={`${name}_place_type`} value={selection?.placeType ?? ""} readOnly />
      <datalist id={listId}>
        {demoAddressSuggestions(value).map((address) => (
          <option key={address.id} value={address.formattedAddress}>
            {address.label}
          </option>
        ))}
      </datalist>
      <p
        id={helpId}
        role={showError && invalid ? "alert" : undefined}
        className={`mt-1.5 text-xs ${showError && invalid ? "font-medium text-red-600" : "text-stone-500"}`}
      >
        {showError && invalid
          ? "Choose an address from the demo suggestions."
          : "Choose one of the available demo addresses."}
      </p>
    </>
  );
}
