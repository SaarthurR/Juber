export function PageLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-[#fbf7f2]"
    >
      <div className="w-full">
        <div aria-hidden="true" className="relative h-28 w-full overflow-hidden">
          <div className="absolute inset-x-0 top-[72px] h-[3px] bg-stone-300/80" />
          <div className="route-loading-car absolute left-0 top-5 text-brand-600">
            <svg
              viewBox="0 0 128 64"
              className="h-16 w-32 drop-shadow-[0_10px_8px_rgba(92,59,46,0.18)]"
            >
              <path
                d="M18 42h-7a5 5 0 0 1-5-5v-8c0-4 3-7 7-8l18-4 10-11h38l14 14 20 5c5 1 8 5 8 10v7h-9"
                fill="currentColor"
              />
              <path d="m39 17 8-8h13v10H37l2-2Zm25-8h13l10 11H64V9Z" fill="#f9e7cc" />
              <path d="M39 42h50" stroke="#7f3f24" strokeWidth="3" strokeLinecap="round" />
              <circle className="route-loading-wheel" cx="28" cy="43" r="10" fill="#292524" />
              <circle cx="28" cy="43" r="4" fill="#d6d3d1" />
              <circle className="route-loading-wheel" cx="101" cy="43" r="10" fill="#292524" />
              <circle cx="101" cy="43" r="4" fill="#d6d3d1" />
            </svg>
          </div>
        </div>
        <p aria-hidden="true" className="mt-3 text-center text-sm font-extrabold tracking-wide text-brand-700">
          On the way...
        </p>
      </div>
      <span className="sr-only">Loading the next page</span>
    </div>
  );
}
