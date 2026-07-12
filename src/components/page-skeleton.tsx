export function PageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading page"
      className="mx-auto w-full max-w-5xl animate-pulse px-4 py-6 motion-reduce:animate-none sm:px-6"
    >
      <div className="h-8 w-40 rounded-lg bg-tint" />
      <div className="mt-6 space-y-3">
        <div className="h-28 rounded-2xl border border-border bg-white p-4">
          <div className="h-4 w-1/3 rounded bg-tint" />
          <div className="mt-4 h-3 w-2/3 rounded bg-tint" />
          <div className="mt-2 h-3 w-1/2 rounded bg-tint" />
        </div>
        <div className="h-28 rounded-2xl border border-border bg-white p-4">
          <div className="h-4 w-1/4 rounded bg-tint" />
          <div className="mt-4 h-3 w-3/5 rounded bg-tint" />
          <div className="mt-2 h-3 w-2/5 rounded bg-tint" />
        </div>
      </div>
    </div>
  );
}
