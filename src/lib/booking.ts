export const MAX_GUESTS = 4;

export function partyTotal(guestCount: number) {
  return 1 + Math.max(0, guestCount);
}

export function maxGuestCount(seatsAvailable: number) {
  return Math.max(0, Math.min(MAX_GUESTS, seatsAvailable - 1));
}

export function passengerDisplayName(
  fullName: string | null | undefined,
  guestCount: number,
) {
  const name = fullName?.trim() || "Member";
  return guestCount > 0 ? `${name} (+${guestCount})` : name;
}

export function parseGuestCount(raw: FormDataEntryValue | null, seatsAvailable: number) {
  const n = Number.parseInt(String(raw ?? "0"), 10);
  if (!Number.isFinite(n) || n < 0 || n > MAX_GUESTS) {
    throw new Error(`Party size must be between 1 and ${MAX_GUESTS + 1}.`);
  }
  const maxGuests = maxGuestCount(seatsAvailable);
  if (n > maxGuests) {
    throw new Error(
      maxGuests === 0
        ? "Only one seat is left on this ride."
        : `This ride has room for at most ${partyTotal(maxGuests)} people.`,
    );
  }
  return n;
}

export function parsePickupSource(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (value === "home" || value === "custom") return value;
  return null;
}

export function trimPickupNote(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  return value.length ? value : null;
}

export function confirmedSeatTotal(
  passengers: Array<{ status: string; guest_count?: number }>,
) {
  return passengers
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + partyTotal(p.guest_count ?? 0), 0);
}

export function googleMapsUrl(address: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(address.trim())}`;
}
