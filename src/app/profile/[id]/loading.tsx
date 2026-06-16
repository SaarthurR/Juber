export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-stone-100" />
        <div className="space-y-3">
          <div className="h-7 w-44 rounded-full bg-stone-100" />
          <div className="h-4 w-36 rounded-full bg-stone-100" />
        </div>
      </div>
      <div className="h-28 rounded-2xl bg-stone-100" />
      <div className="h-40 rounded-2xl bg-stone-100" />
    </div>
  );
}
