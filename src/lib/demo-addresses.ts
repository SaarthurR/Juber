export type DemoAddress = {
  id: string;
  label: string;
  formattedAddress: string;
};

export type DemoAddressSelection = {
  address: string;
  placeId: string;
  placeType: "street_address";
};

export type DemoRoute = {
  origin: DemoAddress;
  destination: DemoAddress;
  distanceMiles: number;
  durationMinutes: number;
};

export const DEMO_ADDRESSES: readonly DemoAddress[] = [
  {
    id: "demo-place-jcnc",
    label: "Jain Center of Northern California",
    formattedAddress: "722 S Main St, Milpitas, CA 95035",
  },
  {
    id: "demo-place-fremont",
    label: "Fremont pickup",
    formattedAddress: "3300 Capitol Ave, Fremont, CA 94538",
  },
  {
    id: "demo-place-milpitas",
    label: "Milpitas pickup",
    formattedAddress: "160 N Main St, Milpitas, CA 95035",
  },
  {
    id: "demo-place-santa-clara",
    label: "Santa Clara pickup",
    formattedAddress: "1500 Warburton Ave, Santa Clara, CA 95050",
  },
  {
    id: "demo-place-san-jose",
    label: "San Jose pickup",
    formattedAddress: "200 E Santa Clara St, San Jose, CA 95113",
  },
  {
    id: "demo-place-driver-home",
    label: "Driver home",
    formattedAddress: "3251 20th Ave, San Francisco, CA",
  },
  {
    id: "demo-place-rider-home",
    label: "Rider address",
    formattedAddress: "1820 Shattuck Ave, Berkeley, CA",
  },
];

const ROUTES: Record<string, readonly [number, number]> = {
  "demo-place-fremont:demo-place-jcnc": [11.8, 18],
  "demo-place-jcnc:demo-place-milpitas": [1.6, 5],
  "demo-place-jcnc:demo-place-santa-clara": [7.7, 13],
  "demo-place-jcnc:demo-place-san-jose": [8.1, 14],
  "demo-place-fremont:demo-place-milpitas": [10.8, 17],
  "demo-place-fremont:demo-place-santa-clara": [15.8, 24],
  "demo-place-fremont:demo-place-san-jose": [18.2, 26],
  "demo-place-milpitas:demo-place-santa-clara": [7.1, 12],
  "demo-place-milpitas:demo-place-san-jose": [7.3, 13],
  "demo-place-san-jose:demo-place-santa-clara": [5.1, 10],
  "demo-place-driver-home:demo-place-rider-home": [18.4, 29],
};

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const DEMO_ADDRESS_PATTERN = DEMO_ADDRESSES.map((address) =>
  escapePattern(address.formattedAddress),
).join("|");

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function findDemoAddress(value: string) {
  const normalized = normalize(value);
  return DEMO_ADDRESSES.find(
    (address) => normalize(address.id) === normalized || normalize(address.formattedAddress) === normalized,
  );
}

export function demoAddressSuggestions(query: string, limit = 5) {
  const normalized = normalize(query);
  return DEMO_ADDRESSES.filter(
    (address) =>
      !normalized ||
      normalize(address.label).includes(normalized) ||
      normalize(address.formattedAddress).includes(normalized),
  ).slice(0, Math.max(0, limit));
}

export function demoAddressSelection(value: string): DemoAddressSelection | null {
  const address = findDemoAddress(value);
  return address
    ? {
        address: address.formattedAddress,
        placeId: address.id,
        placeType: "street_address",
      }
    : null;
}

export function isDemoAddressSelectionValid(value: string, required: boolean) {
  return value.trim() ? Boolean(demoAddressSelection(value)) : !required;
}

export function demoRoute(originValue: string, destinationValue: string): DemoRoute | null {
  const origin = findDemoAddress(originValue);
  const destination = findDemoAddress(destinationValue);
  if (!origin || !destination) return null;
  if (origin.id === destination.id) {
    return { origin, destination, distanceMiles: 0, durationMinutes: 0 };
  }
  const metrics = ROUTES[[origin.id, destination.id].sort().join(":")];
  if (!metrics) return null;
  return {
    origin,
    destination,
    distanceMiles: metrics[0],
    durationMinutes: metrics[1],
  };
}
