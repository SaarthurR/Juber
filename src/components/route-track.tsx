export function RouteTrack({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-medium text-stone-900">{from}</span>
      <div className="flex flex-1 items-center">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-stone-400 bg-white" />
        <span className="h-0.5 flex-1 bg-stone-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-800" />
      </div>
      <span className="font-medium text-stone-900">{to}</span>
    </div>
  );
}
