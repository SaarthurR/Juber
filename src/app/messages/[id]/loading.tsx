export default function Loading() {
  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 sm:px-6">
      <div className="flex items-center gap-3 border-b border-stone-200 py-4">
        <div className="h-9 w-9 rounded-full bg-stone-100" />
        <div className="h-10 w-10 rounded-full bg-stone-100" />
        <div className="h-4 w-32 rounded-full bg-stone-100" />
      </div>
      <div className="flex-1 space-y-3 overflow-hidden py-4">
        <div className="h-9 w-2/3 rounded-2xl bg-stone-100" />
        <div className="ml-auto h-9 w-1/2 rounded-2xl bg-brand-100" />
        <div className="h-9 w-3/5 rounded-2xl bg-stone-100" />
      </div>
      <div className="flex items-center gap-2 border-t border-stone-200 py-4">
        <div className="h-10 flex-1 rounded-full bg-stone-100" />
        <div className="h-10 w-10 rounded-full bg-brand-100" />
      </div>
    </div>
  );
}
