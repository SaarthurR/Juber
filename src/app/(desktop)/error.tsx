"use client";

export default function DesktopError({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-extrabold text-ink">We couldn&apos;t load this page</h1>
      <p className="mt-2 text-sm text-stone-500">Please try again.</p>
      <button
        type="button"
        onClick={unstable_retry}
        className="mt-5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white"
      >
        Try again
      </button>
    </div>
  );
}
