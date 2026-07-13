"use client";

import Image from "next/image";
import { useState } from "react";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "linear-gradient(135deg,#c9712f,#8a4420)", // brown
  "linear-gradient(135deg,#6d8b3c,#3f5a1e)", // green
  "linear-gradient(135deg,#3b82c4,#1e4e86)", // blue
  "linear-gradient(135deg,#8e6bb8,#5b3e86)", // violet
] as const;

// Deterministic gradient pick so a given person keeps the same color.
function pickGradient(seed?: string | null) {
  if (!seed) return GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export function MAvatar({
  src,
  name,
  size = 40,
  seed,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  seed?: string | null;
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
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={name ?? "Avatar"}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: pickGradient(seed ?? name),
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-extrabold text-white",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
