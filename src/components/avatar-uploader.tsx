"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/utils";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Avatar with a real upload affordance. Uploads to the public `avatars` bucket
 * under the user's own folder (RLS-enforced), then sets profiles.avatar_url.
 */
export function AvatarUploader({
  userId,
  name,
  initialUrl,
  size = 120,
  tone = "light",
}: {
  userId: string;
  name: string | null;
  initialUrl: string | null;
  size?: number;
  /** "light" = desktop neutral badge, "brand" = mobile brand badge. */
  tone?: "light" | "brand";
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 4MB.");
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setError(uploadError.message);
      setBusy(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    const cacheBusted = `${publicUrl}?v=${Date.now()}`;

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ avatar_url: cacheBusted })
      .eq("id", userId);
    if (dbError) {
      setError(dbError.message);
      setBusy(false);
      return;
    }

    setUrl(cacheBusted);
    setBusy(false);
    router.refresh();
  }

  const badge =
    tone === "brand"
      ? "border-[3px] border-cream bg-brand-600 text-white"
      : "border border-[#e2ddd5] bg-white text-stone-500";

  return (
    <div className="flex flex-col items-center text-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Change profile photo"
        className="relative rounded-full transition active:scale-95 disabled:opacity-70"
        style={{ width: size, height: size }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={name ?? "Your avatar"}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-extrabold text-white" style={{ fontSize: size * 0.35 }}>
            {initials(name)}
          </span>
        )}
        <span
          className={`absolute bottom-1 right-1 flex h-[34px] w-[34px] items-center justify-center rounded-full ${badge}`}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        </span>
      </button>
      <p className="mt-3 text-sm font-bold text-ink">{busy ? "Uploading…" : "Update photo"}</p>
      <p className="mt-0.5 text-[13px] text-muted-warm">JPG, PNG, or WebP, up to 4MB</p>
      {error && <p className="mt-1 text-[13px] font-semibold text-red-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFile}
        className="hidden"
      />
    </div>
  );
}
