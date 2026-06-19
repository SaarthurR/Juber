"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { postRide } from "@/app/rides/actions";
import { JCNC_LABEL } from "@/lib/constants";
import { EventSelect, PlacesDatalist, SubmitButton } from "@/components/form-bits";
import type { EventRow, Place } from "@/lib/types";

type Direction = "to_jcnc" | "from_jcnc";

export function NewRideForm({
  events,
  places,
  defaultEventId,
  minDepartAt,
}: {
  events: EventRow[];
  places: Place[];
  defaultEventId?: string;
  minDepartAt: string;
}) {
  const [direction, setDirection] = useState<Direction | null>(null);
  const [routePlace, setRoutePlace] = useState("");
  const [departAt, setDepartAt] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [returnDepartAt, setReturnDepartAt] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [validationError, setValidationError] = useState("");
  const [formState, formAction] = useActionState(postRide, null);
  const directionSectionRef = useRef<HTMLElement>(null);
  const firstDirectionButtonRef = useRef<HTMLButtonElement>(null);
  const handledInvalidRef = useRef(false);

  const progress = useMemo(() => {
    const completed = [
      direction,
      routePlace.trim(),
      departAt,
      !roundTrip || returnDepartAt,
      dropoffLocation.trim(),
      pickupLocation.trim(),
    ].filter(Boolean).length;
    return 8 + completed * 18;
  }, [departAt, direction, dropoffLocation, pickupLocation, returnDepartAt, roundTrip, routePlace]);

  const routeQuestion = direction === "from_jcnc" ? "To where?" : "From where?";
  const routePlaceholder =
    direction === "from_jcnc" ? "Destination city / neighborhood" : "Starting city / neighborhood";

  function scrollToField(field: HTMLElement, focusTarget = field) {
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 300);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    setValidationError("");
    handledInvalidRef.current = false;

    if (!direction) {
      event.preventDefault();
      setValidationError("Please choose whether this ride is to or from JCNC.");
      if (directionSectionRef.current && firstDirectionButtonRef.current) {
        scrollToField(directionSectionRef.current, firstDirectionButtonRef.current);
      }
      return;
    }

    if (!event.currentTarget.checkValidity()) {
      event.preventDefault();
    }
  }

  function handleInvalid(event: React.InvalidEvent<HTMLFormElement>) {
    event.preventDefault();
    if (handledInvalidRef.current) return;
    handledInvalidRef.current = true;

    const field = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const labels: Record<string, string> = {
      route_place: routeQuestion,
      depart_at: "Departure date and time",
      return_depart_at: "Return date and time",
      dropoff_location: "Drop off location",
      pickup_location: "Pick up location",
      seats_total: "Seats available",
    };
    const label = labels[field.name] ?? "This field";
    let message = field.validationMessage;
    if (field.validity.valueMissing) {
      message = `Please fill in ${label.toLowerCase()}.`;
    } else if (field.name === "seats_total" && field.validity.rangeUnderflow) {
      message = "Seats available must be at least 1.";
    } else if (field.validity.rangeUnderflow) {
      message = `${label} must be later than the minimum shown.`;
    }

    setValidationError(message);
    scrollToField(field.closest<HTMLElement>("label, section") ?? field, field);
  }

  return (
    <form
      action={formAction}
      className="space-y-8"
      noValidate
      onSubmit={handleSubmit}
      onInvalid={handleInvalid}
    >
      <div className="h-2 overflow-hidden rounded-full bg-[#efe9e1]">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      <section ref={directionSectionRef} className="space-y-4">
        <h2 className="text-[18px] font-extrabold text-ink">Where are you heading?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <DirectionButton
            active={direction === "to_jcnc"}
            onClick={() => setDirection("to_jcnc")}
            buttonRef={firstDirectionButtonRef}
          >
            To {JCNC_LABEL}
          </DirectionButton>
          <DirectionButton
            active={direction === "from_jcnc"}
            onClick={() => setDirection("from_jcnc")}
          >
            From {JCNC_LABEL}
          </DirectionButton>
        </div>
        <input type="hidden" name="direction" value={direction ?? ""} />
      </section>

      {direction && (
        <section className="space-y-3">
          <label className="block">
            <span className="mb-2.5 block text-[18px] font-extrabold text-ink">
              {routeQuestion}
            </span>
            <div className="flex items-center rounded-xl bg-brand-50/80 ring-1 ring-brand-100 focus-within:ring-2 focus-within:ring-brand-200">
              <input
                name="route_place"
                required
                value={routePlace}
                onChange={(event) => setRoutePlace(event.target.value)}
                placeholder={routePlaceholder}
                list="places"
                className="min-h-14 flex-1 bg-transparent px-4 text-[16px] font-bold text-brand-700 outline-none placeholder:text-brand-600/60"
              />
              {routePlace && (
                <button
                  type="button"
                  aria-label="Clear place"
                  onClick={() => setRoutePlace("")}
                  className="mr-3 flex h-9 w-9 items-center justify-center rounded-full text-brand-600 transition hover:bg-white/70"
                >
                  <X size={21} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </label>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-[18px] font-extrabold text-ink">When are you leaving?</h2>
        <div>
          <input
            name="depart_at"
            type="datetime-local"
            min={minDepartAt}
            required
            value={departAt}
            onChange={(event) => setDepartAt(event.target.value)}
            className="w-full rounded-xl border border-[#d8d0c5] bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[18px] font-extrabold text-ink">Is this a round trip?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <DirectionButton active={!roundTrip} onClick={() => setRoundTrip(false)}>
            One way
          </DirectionButton>
          <DirectionButton active={roundTrip} onClick={() => setRoundTrip(true)}>
            Round trip
          </DirectionButton>
        </div>
        <input type="hidden" name="round_trip" value={roundTrip ? "true" : "false"} />

        {roundTrip && (
          <div className="grid gap-3 rounded-2xl border border-brand-100 bg-brand-50/45 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-extrabold uppercase tracking-[0.1em] text-brand-700">
                Return time
              </span>
              <input
                name="return_depart_at"
                type="datetime-local"
                min={departAt || minDepartAt}
                required={roundTrip}
                value={returnDepartAt}
                onChange={(event) => setReturnDepartAt(event.target.value)}
                className="w-full rounded-xl border border-[#d8d0c5] bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-extrabold uppercase tracking-[0.1em] text-brand-700">
                Return details
              </span>
              <input
                name="return_notes"
                type="text"
                placeholder="Same spots, after event ends, flexible, etc."
                className="w-full rounded-xl border border-[#d8d0c5] bg-white px-3.5 py-3 text-[15px] outline-none placeholder:text-[#a8a29e] focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </div>
        )}
      </section>

      <LocationField
        label="Drop off location"
        name="dropoff_location"
        value={dropoffLocation}
        onChange={setDropoffLocation}
        hint='This is where riders will be dropped off. If you do not have a specific location, feel free to put "flexible".'
      />

      <LocationField
        label="Pick up location"
        name="pickup_location"
        value={pickupLocation}
        onChange={setPickupLocation}
        hint='This is where riders will meet up with you. If you do not have a specific location, feel free to put "flexible".'
      />

      <section className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-[15px] font-bold text-ink">Seats available</span>
          <input
            name="seats_total"
            type="number"
            min={1}
            defaultValue="3"
            required
            className="w-full rounded-xl border border-[#e2ddd5] px-3.5 py-3 text-[15px] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[15px] font-bold text-ink">Gas / seat ($, optional)</span>
          <input
            name="gas_contribution"
            type="number"
            min={0}
            placeholder="0"
            className="w-full rounded-xl border border-[#e2ddd5] px-3.5 py-3 text-[15px] outline-none placeholder:text-[#a8a29e] focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </section>

      <EventSelect events={events} defaultValue={defaultEventId ?? ""} />

      <label className="block">
        <span className="mb-1 block text-[15px] font-bold text-ink">Notes (optional)</span>
        <textarea
          name="notes"
          placeholder="Return trip details, contact preferences, etc."
          rows={3}
          className="w-full rounded-xl border border-[#e2ddd5] px-3.5 py-3 text-[15px] outline-none placeholder:text-[#a8a29e] focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <PlacesDatalist places={places} />
      {(validationError || formState?.error) && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {validationError || formState?.error}
        </p>
      )}
      <SubmitButton>Post ride</SubmitButton>
    </form>
  );
}

function DirectionButton({
  active,
  onClick,
  buttonRef,
  children,
}: {
  active: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-14 rounded-xl border-2 px-4 text-[17px] font-extrabold transition active:scale-[0.98] ${
        active
          ? "border-brand-600 bg-brand-600 text-white shadow-[0_10px_24px_-16px_rgba(92,59,46,0.8)]"
          : "border-ink bg-white text-ink hover:border-brand-600 hover:text-brand-700"
      }`}
    >
      {children}
    </button>
  );
}

function LocationField({
  label,
  name,
  hint,
  value,
  onChange,
}: {
  label: string;
  name: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[18px] font-extrabold text-ink">{label}</span>
      <span className="mb-3 block text-[15px] leading-relaxed text-stone-600">{hint}</span>
      <textarea
        name={name}
        required
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[#cfc7bd] bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}
