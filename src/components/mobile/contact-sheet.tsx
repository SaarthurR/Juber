"use client";

import { useState } from "react";
import { Phone, MessageCircle } from "lucide-react";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { MAvatar } from "@/components/mobile/m-avatar";
import { openConversation } from "@/app/messages/actions";
import { PendingActionButton, PendingActionGroup, usePendingActionOpen } from "@/components/pending-action-button";

type Method = "phone" | "whatsapp" | "message" | null;

function WhatsAppIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#25D366"
        d="M12.04 2a9.84 9.84 0 0 0-8.5 14.78L2.4 22l5.35-1.1A9.84 9.84 0 1 0 12.04 2Z"
      />
      <path
        fill="white"
        d="M17.5 14.5c-.27.78-1.36 1.44-2.17 1.63-.58.12-1.34.22-3.9-.84-3.27-1.36-5.38-4.68-5.54-4.9-.16-.21-1.32-1.75-1.32-3.34s.83-2.37 1.13-2.7c.27-.3.72-.44 1.15-.44h.4c.35.01.53.04.76.58.27.65.93 2.25 1.01 2.42.08.16.13.36.03.57-.09.22-.14.35-.28.53-.14.16-.3.37-.43.5-.14.15-.29.3-.12.58.16.27.72 1.18 1.54 1.9 1.06.95 1.95 1.24 2.24 1.38.27.14.44.12.61-.07.2-.22.7-.82.89-1.1.18-.27.38-.23.64-.14.27.1 1.7.8 1.99.95.3.15.49.22.56.34.08.13.08.72-.19 1.5Z"
      />
    </svg>
  );
}

export function ContactSheet({
  driverId,
  driverFullName,
  rideId,
  phone,
  whatsapp,
  preferredContact,
}: {
  driverId: string;
  driverFullName: string | null;
  rideId: string;
  phone: string | null;
  whatsapp: string | null;
  preferredContact: Method;
}) {
  return (
    <PendingActionGroup>
      <ContactSheetContent
        driverId={driverId}
        driverFullName={driverFullName}
        rideId={rideId}
        phone={phone}
        whatsapp={whatsapp}
        preferredContact={preferredContact}
      />
    </PendingActionGroup>
  );
}

export function ContactSheetContent({
  driverId,
  driverFullName,
  rideId,
  phone,
  whatsapp,
  preferredContact,
  defaultOpen = false,
}: {
  driverId: string;
  driverFullName: string | null;
  rideId: string;
  phone: string | null;
  whatsapp: string | null;
  preferredContact: Method;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const pendingActionOpen = usePendingActionOpen();
  const firstName = driverFullName?.split(" ")[0] ?? "the driver";
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.replace(/[^\d]/g, "")}` : null;

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

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="contact-title"
        dismissDisabled={pendingActionOpen}
        closeLabel="Close contact sheet"
      >
        <div className="flex items-center gap-3 pb-4">
          <MAvatar name={driverFullName} seed={driverId} size={44} />
          <div className="min-w-0 flex-1">
            <p id="contact-title" className="truncate text-[15px] font-extrabold text-ink">
              Contact {firstName}
            </p>
            <p className="text-xs text-muted-warm">Reach out to confirm your seat</p>
          </div>
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
          {whatsapp && whatsappHref && (
            <ContactRow
              href={whatsappHref}
              external
              icon={<WhatsAppIcon />}
              label="WhatsApp"
              value={whatsapp}
              preferred={preferredContact === "whatsapp"}
            />
          )}
          <form action={openConversation.bind(null, driverId)}>
            <input type="hidden" name="ride_id" value={rideId} />
            <input type="hidden" name="base" value="/m/messages" />
            <ContactRow
              as="button"
              actionKey={`mobile-contact-message-${rideId}-${driverId}`}
              pendingLabel="Opening chat..."
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
  actionKey,
  pendingLabel,
  icon,
  label,
  value,
  preferred,
}: {
  href?: string;
  external?: boolean;
  as?: "a" | "button";
  actionKey?: string;
  pendingLabel?: string;
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
    if (actionKey && pendingLabel) {
      return (
        <PendingActionButton
          actionKey={actionKey}
          pendingLabel={pendingLabel}
          className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {inner}
        </PendingActionButton>
      );
    }

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
