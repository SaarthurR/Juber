export default function Loading() {
  return (
    <div
      aria-label="Loading page"
      className="mx-auto w-full max-w-5xl animate-pulse px-4 py-8 sm:px-6 sm:py-10"
    >
      <div className="h-40 rounded-3xl bg-stone-100" />
      <div className="mt-8 h-7 w-44 rounded-lg bg-stone-100" />
      <div className="mt-5 grid gap-4">
        <div className="h-28 rounded-2xl bg-stone-100" />
        <div className="h-28 rounded-2xl bg-stone-100" />
        <div className="h-28 rounded-2xl bg-stone-100" />
      </div>
    </div>
  );
}
