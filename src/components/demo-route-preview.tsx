import { demoRoute } from "@/lib/demo-addresses";

export function DemoRoutePreview({
  origin,
  destination,
  className = "",
}: {
  origin: string;
  destination: string;
  className?: string;
}) {
  const knownRoute = demoRoute(origin, destination);
  const route = knownRoute ?? {
    origin: { label: "Rider address", formattedAddress: origin },
    destination: { label: "JCNC", formattedAddress: destination },
    distanceMiles: 4.8,
    durationMinutes: 12,
  };

  return (
    <figure
      aria-label={`Driving route from ${route.origin.formattedAddress} to ${route.destination.formattedAddress}`}
      className={`overflow-hidden rounded-xl border border-stone-200 bg-white ${className}`}
    >
      <div className="relative h-[180px] overflow-hidden bg-stone-100">
        <svg viewBox="0 0 400 180" aria-hidden="true" className="h-full w-full">
          <rect width="400" height="180" fill="#f5f5f4" />
          <path d="M-15 42 L420 122 M-20 138 L410 68 M70 -15 L155 200 M315 -20 L245 205" stroke="#e7e5e4" strokeWidth="10" />
          <path d="M38 137 C92 125 91 64 150 79 S235 132 276 91 S333 47 362 39" fill="none" stroke="#16a34a" strokeLinecap="round" strokeWidth="6" />
          <circle cx="38" cy="137" r="12" fill="#fff" stroke="#16a34a" strokeWidth="4" />
          <circle cx="362" cy="39" r="12" fill="#16a34a" stroke="#fff" strokeWidth="4" />
          <circle cx="38" cy="137" r="3" fill="#16a34a" />
        </svg>
        <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-2 shadow-sm">
          <p className="text-base font-extrabold text-stone-900">{route.distanceMiles} miles</p>
          <p className="text-xs font-semibold text-stone-500">About {route.durationMinutes} min</p>
        </div>
      </div>
      <figcaption className="grid gap-3 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Origin</p>
          <p className="mt-1 font-semibold text-stone-800">{route.origin.label}</p>
          <p className="mt-0.5 break-words text-stone-500">{route.origin.formattedAddress}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Destination</p>
          <p className="mt-1 font-semibold text-stone-800">{route.destination.label}</p>
          <p className="mt-0.5 break-words text-stone-500">{route.destination.formattedAddress}</p>
        </div>
      </figcaption>
    </figure>
  );
}
