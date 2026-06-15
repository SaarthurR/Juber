export function RouteTrack({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-medium text-stone-900 truncate">{from}</span>
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <span className="h-2 w-2 shrink-0 rounded-full border-2 border-stone-400 bg-white" />
        <span className="h-px flex-1 bg-stone-300" />
        <span className="h-2 w-2 shrink-0 rounded-full bg-stone-700" />
      </div>
      <span className="font-medium text-stone-900 truncate">{to}</span>
    </div>
  );
}
