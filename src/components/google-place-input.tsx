"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GOOGLE_ADDRESS_TYPES } from "@/lib/driver-route";

type PlaceAutocompleteElement = HTMLElement & {
  description: string;
  includedPrimaryTypes: string[];
  maxLength: number;
  placeholder: string;
  value: string;
};

type PlaceSelectEvent = Event & {
  placePrediction?: {
    toPlace(): {
      formattedAddress?: string;
      id?: string;
      types?: string[];
      fetchFields(options: { fields: string[] }): Promise<void>;
    };
  };
};

declare global {
  interface Window {
    google?: {
      maps: {
        importLibrary(name: "places"): Promise<{
          PlaceAutocompleteElement: new () => PlaceAutocompleteElement;
        }>;
      };
    };
  }
}

let placesPromise: Promise<{
  PlaceAutocompleteElement: new () => PlaceAutocompleteElement;
}> | null = null;

function loadPlaces(key: string) {
  if (window.google?.maps) return window.google.maps.importLibrary("places");
  if (placesPromise) return placesPromise;
  placesPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&libraries=places&v=weekly`;
    script.async = true;
    script.onload = () =>
      window.google?.maps.importLibrary("places").then(resolve, reject) ??
      reject(new Error("Google Maps did not load"));
    script.onerror = () => reject(new Error("Google Maps did not load"));
    document.head.append(script);
  });
  return placesPromise;
}

export function GooglePlaceInput({
  name,
  initialValue = "",
  placeholder,
  label,
  maxLength = 500,
  required = false,
  className,
  ariaDescribedBy,
  manualFallback = false,
}: {
  name: string;
  initialValue?: string;
  placeholder: string;
  label: string;
  maxLength?: number;
  required?: boolean;
  className: string;
  ariaDescribedBy?: string;
  manualFallback?: boolean;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLACES_KEY ?? "";
  const messageId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const placeIdRef = useRef<HTMLInputElement>(null);
  const placeTypeRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<PlaceAutocompleteElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    key ? "loading" : "error",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!key || !hostRef.current) return;
    let active = true;
    let autocomplete: PlaceAutocompleteElement | null = null;
    const host = hostRef.current;

    loadPlaces(key)
      .then(({ PlaceAutocompleteElement }) => {
        if (!active) return;
        autocomplete = new PlaceAutocompleteElement();
        autocompleteRef.current = autocomplete;
        autocomplete.description = label;
        autocomplete.includedPrimaryTypes = [...GOOGLE_ADDRESS_TYPES];
        autocomplete.maxLength = maxLength;
        autocomplete.placeholder = placeholder;
        autocomplete.value = initialValue;
        autocomplete.className = className;
        autocomplete.setAttribute("aria-label", label);
        autocomplete.setAttribute("maxlength", String(maxLength));
        const clearSelection = () => {
          if (hiddenRef.current) hiddenRef.current.value = autocomplete?.value ?? "";
          if (placeIdRef.current) placeIdRef.current.value = "";
          if (placeTypeRef.current) placeTypeRef.current.value = "";
          setMessage(autocomplete?.value.trim() ? "Choose a street address from the suggestions." : "");
        };
        const resetSelection = () => {
          if (hiddenRef.current) hiddenRef.current.value = initialValue;
          if (placeIdRef.current) placeIdRef.current.value = "";
          if (placeTypeRef.current) placeTypeRef.current.value = "";
          if (autocomplete) autocomplete.value = initialValue;
        };
        const selectPlace = async (event: Event) => {
          const place = (event as PlaceSelectEvent).placePrediction?.toPlace();
          if (!place) return;
          try {
            await place.fetchFields({ fields: ["formattedAddress", "id", "types"] });
            if (!active) return;
            const placeType = place.types?.find((type) =>
              GOOGLE_ADDRESS_TYPES.includes(type as (typeof GOOGLE_ADDRESS_TYPES)[number]),
            );
            if (!place.formattedAddress || !place.id || !placeType) {
              resetSelection();
              setMessage("Choose a specific street address, apartment, or building.");
              autocomplete?.focus();
              return;
            }
            if (hiddenRef.current) hiddenRef.current.value = place.formattedAddress;
            if (placeIdRef.current) placeIdRef.current.value = place.id;
            if (placeTypeRef.current) placeTypeRef.current.value = placeType;
            autocomplete!.value = place.formattedAddress;
            setMessage("");
          } catch {
            resetSelection();
            setMessage("We couldn't verify that address. Choose it again from the suggestions.");
            autocomplete?.focus();
          }
        };
        autocomplete.addEventListener("input", clearSelection);
        autocomplete.addEventListener("gmp-select", selectPlace);
        autocomplete.addEventListener("gmp-error", () => {
          resetSelection();
          setStatus("error");
        });
        host.replaceChildren(autocomplete);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
      autocompleteRef.current = null;
      autocomplete?.remove();
    };
  }, [className, initialValue, key, label, maxLength, placeholder]);

  useEffect(() => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete) return;
    const describedBy = [ariaDescribedBy, message ? messageId : null].filter(Boolean).join(" ");
    if (describedBy) autocomplete.setAttribute("aria-describedby", describedBy);
    else autocomplete.removeAttribute("aria-describedby");
    autocomplete.setAttribute("aria-invalid", message ? "true" : "false");
    autocomplete.description = message ? `${label}. ${message}` : label;
  }, [ariaDescribedBy, label, message, messageId]);

  useEffect(() => {
    if (status !== "ready") return;
    const form = hiddenRef.current?.form;
    if (!form) return;
    const validate = (event: SubmitEvent) => {
      const address = hiddenRef.current?.value.trim() ?? "";
      if ((!address && !required) || address === initialValue.trim() || placeIdRef.current?.value) return;
      event.preventDefault();
      setMessage("Choose a street address from the suggestions.");
      autocompleteRef.current?.focus();
    };
    form.addEventListener("submit", validate);
    return () => form.removeEventListener("submit", validate);
  }, [initialValue, required, status]);

  if (status === "error" && manualFallback && !key) {
    return (
      <>
        <input
          name={name}
          aria-label={label}
          defaultValue={initialValue}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          aria-describedby={ariaDescribedBy}
          className={className}
        />
        <p className="mt-1.5 text-xs text-stone-500">
          Address suggestions are unavailable. You can still enter the address manually.
        </p>
      </>
    );
  }

  if (status === "error") {
    return (
      <>
        <input type="hidden" name={name} defaultValue={initialValue} />
        <input
          disabled
          placeholder="Address search unavailable"
          aria-label={label}
          aria-describedby={ariaDescribedBy}
          className={className}
        />
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
          {initialValue
            ? "Address search is unavailable. Your existing saved address will be kept; try again later."
            : "Address search is unavailable. Try again later or use your saved home."}
        </p>
      </>
    );
  }

  return (
    <>
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={initialValue} />
      <input ref={placeIdRef} type="hidden" name={`${name}_place_id`} />
      <input ref={placeTypeRef} type="hidden" name={`${name}_place_type`} />
      <div
        ref={hostRef}
        className={status === "loading" ? `${className} text-stone-400` : undefined}
      >
        {status === "loading" ? "Loading address search…" : null}
      </div>
      {message && <p id={messageId} role="alert" className="mt-1.5 text-xs font-medium text-red-600">{message}</p>}
    </>
  );
}
