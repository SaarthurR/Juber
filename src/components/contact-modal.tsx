"use client";

import { useState } from "react";
import { Phone, MessageCircle } from "lucide-react";
import { openConversation } from "@/app/messages/actions";

type ContactModalProps = {
  driverName: string;
  phone: string | null;
  whatsapp: string | null;
  preferredContact: "phone" | "whatsapp" | "message" | null;
  rideId: string;
  driverId: string;
};

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
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

export function ContactModal({
  driverName,
  phone,
  whatsapp,
  preferredContact,
  rideId,
  driverId,
}: ContactModalProps) {
  const [open, setOpen] = useState(false);
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.replace(/[^\d]/g, "")}` : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition"
      >
        Contact
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />

          <div
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 text-xl font-bold text-stone-900">Contact</h2>

            <div className="space-y-5">
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-4 group"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <Phone size={18} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900 group-hover:text-brand-600 transition">
                      Phone
                      {preferredContact === "phone" && (
                        <span className="ml-2 text-[11px] font-medium text-emerald-600">preferred</span>
                      )}
                    </p>
                    <p className="text-sm text-stone-500">{phone}</p>
                  </div>
                </a>
              )}

              {whatsapp && whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 group"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden">
                    <WhatsAppIcon />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900 group-hover:text-brand-600 transition">
                      WhatsApp
                      {preferredContact === "whatsapp" && (
                        <span className="ml-2 text-[11px] font-medium text-emerald-600">preferred</span>
                      )}
                    </p>
                    <p className="text-sm text-stone-500">{whatsapp}</p>
                  </div>
                </a>
              )}

              <form action={openConversation.bind(null, driverId)}>
                <input type="hidden" name="ride_id" value={rideId} />
                <button type="submit" className="flex w-full items-center gap-4 group">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50">
                    <MessageCircle size={18} className="text-brand-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-stone-900 group-hover:text-brand-600 transition">
                      Message
                      {preferredContact === "message" && (
                        <span className="ml-2 text-[11px] font-medium text-emerald-600">preferred</span>
                      )}
                    </p>
                    <p className="text-sm text-stone-500">Send {driverName} an in-app message</p>
                  </div>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
