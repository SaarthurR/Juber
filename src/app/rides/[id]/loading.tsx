export default function Loading() {
  return (
    <div>
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 pt-7 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-stone-100" />
          <div>
            <div className="h-7 w-36 rounded-full bg-stone-100" />
            <div className="mt-2 h-4 w-48 rounded-full bg-stone-100" />
          </div>
        </div>
        <div className="h-8 w-20 rounded-full bg-stone-100" />
      </div>
      <div className="mt-5 bg-stone-900">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <div className="h-4 w-48 rounded-full bg-white/20" />
          <div className="mt-5 space-y-3">
            <div className="h-5 w-3/4 rounded-full bg-white/15" />
            <div className="h-5 w-2/3 rounded-full bg-white/15" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="h-16 rounded-xl bg-stone-100" />
        <div className="h-24 rounded-xl bg-stone-100" />
        <div className="h-20 rounded-xl bg-stone-100" />
      </div>
    </div>
  );
}
