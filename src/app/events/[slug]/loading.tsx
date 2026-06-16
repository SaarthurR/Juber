export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="h-6 w-24 rounded-full bg-stone-100" />
      <div className="h-10 w-72 max-w-full rounded-full bg-stone-100" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-48 rounded-2xl bg-stone-100" />
        <div className="h-48 rounded-2xl bg-stone-100" />
      </div>
    </div>
  );
}
