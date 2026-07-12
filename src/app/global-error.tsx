"use client";

import "./globals.css";

export default function GlobalError({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-cream font-sans text-ink">
        <div role="alert" className="mx-auto max-w-lg flex-1 px-4 py-20 text-center">
          <h1 className="text-2xl font-extrabold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-stone-500">Please try again.</p>
          <button
            type="button"
            onClick={unstable_retry}
            className="mt-5 min-h-11 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
