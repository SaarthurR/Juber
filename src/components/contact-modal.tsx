"use client";

import { useState } from "react";
import { Phone, MessageCircle } from "lucide-react";
import { openConversation } from "@/app/messages/actions";

type ContactModalProps = {
  driverName: string;
  phone: string | null;
  instagram: string | null;
  preferredContact: "phone" | "instagram" | "message" | null;
  rideId: string;
  driverId: string;
};

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <defs>
        <radialGradient id="ig" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig)" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="white" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.4" fill="white" />
    </svg>
  );
}

export function ContactModal({
  driverName,
  phone,
  instagram,
  preferredContact,
  rideId,
  driverId,
}: ContactModalProps) {
  const [open, setOpen] = useState(false);
  const instagramHandle = instagram?.startsWith("@") ? instagram.slice(1) : instagram;

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

              {instagram && (
                <a
                  href={`https://instagram.com/${instagramHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 group"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden">
                    <InstagramIcon />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900 group-hover:text-brand-600 transition">
                      Instagram
                      {preferredContact === "instagram" && (
                        <span className="ml-2 text-[11px] font-medium text-emerald-600">preferred</span>
                      )}
                    </p>
                    <p className="text-sm text-stone-500">@{instagramHandle}</p>
                  </div>
                </a>
              )}

              <form action={openConversation.bind(null, driverId, rideId)}>
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
