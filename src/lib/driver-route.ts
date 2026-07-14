import { JCNC_LABEL } from "@/lib/constants";

export type RiderEndpointLabel = "Pickup" | "Drop-off";

export const GOOGLE_ADDRESS_TYPES = ["street_address", "premise", "subpremise"] as const;

export function requireGoogleAddressSelection({
  address,
  placeId,
  placeType,
  previousAddress,
  enabled,
  label,
}: {
  address: string | null;
  placeId: FormDataEntryValue | null;
  placeType: FormDataEntryValue | null;
  previousAddress?: string | null;
  enabled: boolean;
  label: string;
}) {
  if (!enabled || !address || address === previousAddress?.trim()) return;
  const id = placeId?.toString().trim() ?? "";
  const type = placeType?.toString().trim() ?? "";
  if (
    !/^[A-Za-z0-9_-]{10,}$/.test(id) ||
    !GOOGLE_ADDRESS_TYPES.includes(type as (typeof GOOGLE_ADDRESS_TYPES)[number])
  ) {
    throw new Error(`Choose a street address for ${label} from the Google suggestions.`);
  }
}

export function riderEndpointLabel(
  originLabel: string,
  destinationLabel: string,
): RiderEndpointLabel | null {
  const startsAtJcnc = originLabel === JCNC_LABEL;
  const endsAtJcnc = destinationLabel === JCNC_LABEL;
  if (startsAtJcnc === endsAtJcnc) return null;
  return endsAtJcnc ? "Pickup" : "Drop-off";
}

export function driverRouteLeg({
  originLabel,
  destinationLabel,
  driverHome,
  riderEndpoint,
}: {
  originLabel: string;
  destinationLabel: string;
  driverHome: string | null;
  riderEndpoint: string | null;
}) {
  const endpointLabel = riderEndpointLabel(originLabel, destinationLabel);
  const home = driverHome?.trim();
  const endpoint = riderEndpoint?.trim();
  if (!endpointLabel || !home || !endpoint) return null;
  return endpointLabel === "Pickup"
    ? { origin: home, destination: endpoint, endpointLabel }
    : { origin: endpoint, destination: home, endpointLabel };
}

export function driverRouteEmbedUrl({
  apiKey,
  originLabel,
  destinationLabel,
  driverHome,
  riderEndpoint,
}: {
  apiKey: string | undefined;
  originLabel: string;
  destinationLabel: string;
  driverHome: string | null;
  riderEndpoint: string | null;
}) {
  const leg = driverRouteLeg({
    originLabel,
    destinationLabel,
    driverHome,
    riderEndpoint,
  });
  if (!apiKey?.trim() || !leg) return null;
  const url = new URL("https://www.google.com/maps/embed/v1/directions");
  url.searchParams.set("key", apiKey.trim());
  url.searchParams.set("origin", leg.origin);
  url.searchParams.set("destination", leg.destination);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "imperial");
  return url.toString();
}
