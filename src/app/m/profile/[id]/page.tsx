import { notFound, redirect } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getContact } from "@/lib/contact";
import { getProfileContactContext } from "@/lib/profile-contact";
import { openConversation } from "@/app/messages/actions";
import { MAvatar } from "@/components/mobile/m-avatar";
import { SubHeader } from "@/components/mobile/sub-header";
import { PendingActionButton, PendingActionGroup } from "@/components/pending-action-button";
import type { Profile } from "@/lib/types";
import { throwReadError } from "@/lib/supabase/read-error";

export const dynamic = "force-dynamic";

const CONTACT_LOCKED_MESSAGE = "Reserve a ride to contact this person";

export default async function MobilePublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getCurrentUser();
  if (user?.id === id) redirect("/m/profile");

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle<Profile>();

  throwReadError(error, "profile");
  if (!profile) notFound();

  const { canViewContact, messagingRideId } = await getProfileContactContext(
    supabase,
    user?.id,
    id,
  );
  const contact = canViewContact
    ? await getContact(supabase, id)
    : { phone: null, whatsapp: null };
  const preferred = profile.preferred_contact ?? "message";
  const metaLine = [profile.pronouns, profile.neighborhood].filter(Boolean).join(" · ");

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+1rem)]">
      <SubHeader title="Profile" backFallback="/m" />

      <div className="px-4 pt-3">
        <section className="rounded-3xl border border-border bg-white p-5 text-center">
          <MAvatar src={profile.avatar_url} name={profile.full_name} seed={profile.id} size={86} />
          <h1 className="mt-3 text-[23px] font-extrabold text-ink">
            {profile.full_name ?? "Member"}
          </h1>
          {metaLine && <p className="mt-1 text-[13px] text-muted-warm">{metaLine}</p>}
          {profile.bio && (
            <p className="mt-4 text-[14px] leading-relaxed text-muted">{profile.bio}</p>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-white p-4">
          <p className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
            Contact
          </p>
          <ContactRow
            icon={<Phone size={16} className="text-brand-600" />}
            label="Phone"
            value={canViewContact ? contact.phone ?? "Not provided" : CONTACT_LOCKED_MESSAGE}
            preferred={canViewContact && preferred === "phone"}
          />
          <ContactRow
            icon={<WhatsAppIcon />}
            label="WhatsApp"
            value={canViewContact ? contact.whatsapp ?? "Not provided" : CONTACT_LOCKED_MESSAGE}
            preferred={canViewContact && preferred === "whatsapp"}
          />
          <ContactRow
            icon={<MessageCircle size={16} className="text-brand-600" />}
            label="In-app message"
            value={messagingRideId ? "Reach out through Juber" : CONTACT_LOCKED_MESSAGE}
            preferred={Boolean(messagingRideId) && preferred === "message"}
            last
          />
        </section>

        {user && messagingRideId ? (
          <PendingActionGroup>
            <form action={openConversation.bind(null, profile.id)} className="mt-4">
              <input type="hidden" name="ride_id" value={messagingRideId} />
              <input type="hidden" name="base" value="/m/messages" />
              <PendingActionButton
                actionKey={`mobile-profile-message-${profile.id}`}
                pendingLabel="Opening chat..."
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3.5 text-[14px] font-bold text-white transition active:scale-[0.98]"
              >
                <MessageCircle size={17} />
                Message {profile.full_name?.split(" ")[0] ?? "member"}
              </PendingActionButton>
            </form>
          </PendingActionGroup>
        ) : (
          <p className="mt-4 rounded-2xl bg-tint px-4 py-3 text-center text-[13px] font-semibold text-muted">
            {user ? CONTACT_LOCKED_MESSAGE : "Sign in from a ride to unlock contact options."}
          </p>
        )}
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  preferred,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  preferred?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${last ? "" : "mb-4"}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-tint">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink">
          {label}
          {preferred && (
            <span className="ml-2 rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold text-sand-text">
              preferred
            </span>
          )}
        </p>
        <p className="truncate text-[13px] text-muted">{value}</p>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#8a5a2b"
        d="M12.04 2a9.84 9.84 0 0 0-8.5 14.78L2.4 22l5.35-1.1A9.84 9.84 0 1 0 12.04 2Z"
      />
      <path
        fill="white"
        d="M17.5 14.5c-.27.78-1.36 1.44-2.17 1.63-.58.12-1.34.22-3.9-.84-3.27-1.36-5.38-4.68-5.54-4.9-.16-.21-1.32-1.75-1.32-3.34s.83-2.37 1.13-2.7c.27-.3.72-.44 1.15-.44h.4c.35.01.53.04.76.58.27.65.93 2.25 1.01 2.42.08.16.13.36.03.57-.09.22-.14.35-.28.53-.14.16-.3.37-.43.5-.14.15-.29.3-.12.58.16.27.72 1.18 1.54 1.9 1.06.95 1.95 1.24 2.24 1.38.27.14.44.12.61-.07.2-.22.7-.82.89-1.1.18-.27.38-.23.64-.14.27.1 1.7.8 1.99.95.3.15.49.22.56.34.08.13.08.72-.19 1.5Z"
      />
    </svg>
  );
}
