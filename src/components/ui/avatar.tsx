"use client";

import Image from "next/image";
import { useState } from "react";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Avatar({
  src,
  name,
  size = 40,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      <Image
        src={src}
        alt={name ?? "Avatar"}
        width={size}
        height={size}
        onError={() => setFailedSrc(src)}
        className={cn("rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={name ?? "Avatar"}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
