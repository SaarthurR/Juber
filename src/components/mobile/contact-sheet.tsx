"use client";

import { useState } from "react";
import { Phone, MessageCircle, X, AtSign } from "lucide-react";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { MAvatar } from "@/components/mobile/m-avatar";
import { openConversation } from "@/app/messages/actions";

type Method = "phone" | "instagram" | "message" | null;

export function ContactSheet({
  driverId,
  driverFullName,
  rideId,
  phone,
  instagram,
  preferredContact,
}: {
  driverId: string;
  driverFullName: string | null;
  rideId: string;
  phone: string | null;
  instagram: string | null;
  preferredContact: Method;
}) {
  const [open, setOpen] = useState(false);
  const firstName = driverFullName?.split(" ")[0] ?? "the driver";
  const igHandle = instagram?.startsWith("@") ? instagram.slice(1) : instagram;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 rounded-[11px] bg-tint px-3.5 py-2.5 text-[13px] font-bold text-brand-700 transition active:scale-95"
      >
        <Phone size={15} strokeWidth={2.4} />
        Contact
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} labelledBy="contact-title">
        <div className="flex items-center gap-3 pb-4">
          <MAvatar name={driverFullName} seed={driverId} size={44} />
          <div className="min-w-0 flex-1">
            <p id="contact-title" className="truncate text-[15px] font-extrabold text-ink">
              Contact {firstName}
            </p>
            <p className="text-xs text-muted-warm">Reach out to confirm your seat</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-tint text-brand-700"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-2.5 pb-4">
          {phone && (
            <ContactRow
              href={`tel:${phone}`}
              icon={<Phone size={17} className="text-brand-600" />}
              label="Phone"
              value={phone}
              preferred={preferredContact === "phone"}
            />
          )}
          {igHandle && (
            <ContactRow
              href={`https://instagram.com/${igHandle}`}
              external
              icon={<AtSign size={17} className="text-brand-600" />}
              label="Instagram"
              value={`@${igHandle}`}
              preferred={preferredContact === "instagram"}
            />
          )}
          <form action={openConversation.bind(null, driverId)}>
            <input type="hidden" name="ride_id" value={rideId} />
            <ContactRow
              as="button"
              icon={<MessageCircle size={17} className="text-brand-600" />}
              label="In-app message"
              value={`Message ${firstName} on Juber`}
              preferred={preferredContact === "message"}
            />
          </form>
        </div>
      </BottomSheet>
    </>
  );
}

function ContactRow({
  href,
  external,
  as = "a",
  icon,
  label,
  value,
  preferred,
}: {
  href?: string;
  external?: boolean;
  as?: "a" | "button";
  icon: React.ReactNode;
  label: string;
  value: string;
  preferred?: boolean;
}) {
  const inner = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] ${
          preferred ? "bg-white" : "bg-tint"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
          {label}
          {preferred && (
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
              preferred
            </span>
          )}
        </span>
        <span className="block truncate text-[13px] text-muted">{value}</span>
      </span>
    </>
  );

  const className = `flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 transition active:scale-[0.99] ${
    preferred ? "border-brand-600 bg-[#FBF2E8]" : "border-border bg-white"
  }`;

  if (as === "button") {
    return (
      <button type="submit" className={className}>
        {inner}
      </button>
    );
  }

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={className}
    >
      {inner}
    </a>
  );
}
