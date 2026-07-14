"use client";

import { useState } from "react";

export function CopyCaseId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(id);
        setCopied(true);
      }}
      className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]"
      title={id}
    >
      {copied ? "ID copied" : "Copy full ID"}
    </button>
  );
}
