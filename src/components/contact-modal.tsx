"use client";

import { useState } from "react";
import { Phone, AtSign, MessageCircle, X } from "lucide-react";
import { openConversation } from "@/app/messages/actions";

type ContactModalProps = {
  driverName: string;
  phone: string | null;
  instagram: string | null;
  preferredContact: "phone" | "instagram" | "message" | null;
  rideId: string;
  driverId: string;
};

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
        className="text-sm font-bold text-brand-600 hover:text-brand-700"
      >
        Contact
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Modal card */}
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-900">
                Contact {driverName}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-stone-400 hover:text-stone-600 transition"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Contact options */}
            <ul className="space-y-2">
              {phone && (
                <li>
                  <a
                    href={`tel:${phone}`}
                    className="flex w-full items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-800 hover:bg-stone-50 transition"
                  >
                    <Phone size={18} className="text-brand-600 shrink-0" />
                    <span className="flex-1">{phone}</span>
                    {preferredContact === "phone" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Preferred
                      </span>
                    )}
                  </a>
                </li>
              )}

              {instagram && (
                <li>
                  <a
                    href={`https://instagram.com/${instagramHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-800 hover:bg-stone-50 transition"
                  >
                    <AtSign size={18} className="text-brand-600 shrink-0" />
                    <span className="flex-1">@{instagramHandle}</span>
                    {preferredContact === "instagram" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Preferred
                      </span>
                    )}
                  </a>
                </li>
              )}

              <li>
                <form action={openConversation.bind(null, driverId, rideId)}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-800 hover:bg-stone-50 transition"
                  >
                    <MessageCircle size={18} className="text-brand-600 shrink-0" />
                    <span className="flex-1 text-left">Send a message</span>
                    {preferredContact === "message" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Preferred
                      </span>
                    )}
                  </button>
                </form>
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
