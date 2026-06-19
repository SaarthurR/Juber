import { redirect } from "next/navigation";
import { Camera, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { updateProfileMobile } from "@/app/m/actions";
import { SubHeader } from "@/components/mobile/sub-header";
import { MAvatar } from "@/components/mobile/m-avatar";
import { MSubmitButton } from "@/components/mobile/m-submit";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-xl border border-border bg-white px-3.5 py-3 text-[14px] text-ink outline-none placeholder:text-muted-warm focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

function Caption({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[12px] font-semibold text-muted">{children}</span>;
}

export default async function MobileEditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; contact_required?: string }>;
}) {
  const sp = await searchParams;
  const { user, profile } = await getCurrentUser();
  if (!user) redirect("/m");

  const supabase = await createClient();
  const { data: places } = await supabase
    .from("places")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });
  const neighborhoods = ((places as Place[]) ?? []).filter((p) => p.kind !== "event");
  const options = neighborhoods.length ? neighborhoods : ((places as Place[]) ?? []);

  const fullName = (profile?.full_name ?? "").trim();
  const parts = fullName ? fullName.split(/\s+/) : [];
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : fullName;
  const preferred = profile?.preferred_contact ?? "message";
  const hasNeighborhood = options.some((p) => p.name === profile?.neighborhood);

  return (
    <form action={updateProfileMobile} className="pb-28">
      <SubHeader title="Edit profile" backFallback="/m/profile" />

      <div className="space-y-7 px-4 pt-2">
        {(sp.onboarding === "1" || sp.contact_required === "1") && (
          <div className="rounded-[14px] border border-brand-200 bg-tint px-4 py-3 text-[13px] font-bold text-brand-700">
            Add a phone or WhatsApp number to continue using Juber.
          </div>
        )}
        {/* Avatar uploader */}
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <MAvatar src={profile?.avatar_url} name={profile?.full_name} seed={user.id} size={96} />
            <span className="absolute -bottom-1 -right-1 flex h-[34px] w-[34px] items-center justify-center rounded-full border-[3px] border-cream bg-brand-600 text-white">
              <Camera size={16} strokeWidth={2.2} />
            </span>
          </div>
          <p className="mt-3 text-[13px] font-bold text-ink">Update photo</p>
          <p className="text-[12px] text-muted-warm">JPG or PNG, up to 4MB</p>
        </div>

        {/* Personal information */}
        <section>
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
            Personal information
          </h2>
          <div className="space-y-3.5">
            <div className="flex gap-3">
              <label className="block flex-[2]">
                <Caption>First name</Caption>
                <input name="first_name" defaultValue={firstName} required className={inputCls} />
              </label>
              <label className="block flex-1">
                <Caption>Last initial</Caption>
                <input
                  name="last_initial"
                  defaultValue={lastInitial}
                  maxLength={1}
                  placeholder="S"
                  className={inputCls}
                />
              </label>
            </div>
            <label className="block">
              <Caption>Pronouns</Caption>
              <input
                name="pronouns"
                defaultValue={profile?.pronouns ?? ""}
                placeholder="she/her"
                className={inputCls}
              />
            </label>
            <label className="block">
              <Caption>Neighborhood</Caption>
              <SelectWithChevron
                name="neighborhood"
                defaultValue={hasNeighborhood ? (profile?.neighborhood ?? "") : ""}
              >
                <option value="">Choose your neighborhood</option>
                {!hasNeighborhood && profile?.neighborhood && (
                  <option value={profile.neighborhood}>{profile.neighborhood}</option>
                )}
                {options.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </SelectWithChevron>
            </label>
          </div>
        </section>

        {/* Contact */}
        <section>
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
            Contact
          </h2>
          <div className="space-y-3.5">
            <label className="block">
              <Caption>Phone</Caption>
              <input
                name="phone"
                type="tel"
                defaultValue={profile?.phone ?? ""}
                placeholder="(555) 555-5555"
                className={inputCls}
              />
            </label>
            <label className="block">
              <Caption>WhatsApp</Caption>
              <input
                name="whatsapp"
                type="tel"
                defaultValue={profile?.whatsapp ?? ""}
                placeholder="+1 555 555 5555"
                className={inputCls}
              />
            </label>
            <p className="text-[12px] font-medium text-muted-warm">At least one contact number is required.</p>
            <label className="block">
              <Caption>Car make &amp; model (optional)</Caption>
              <input
                name="car_make_model"
                defaultValue={profile?.car_make_model ?? ""}
                placeholder="Toyota Sienna"
                className={inputCls}
              />
            </label>
            <label className="block">
              <Caption>Preferred contact method</Caption>
              <SelectWithChevron name="preferred_contact" defaultValue={preferred}>
                <option value="phone">Phone</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="message">In-app message</option>
              </SelectWithChevron>
            </label>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-border-soft bg-cream px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <MSubmitButton>Save changes</MSubmitButton>
      </div>
    </form>
  );
}

function SelectWithChevron({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select name={name} defaultValue={defaultValue} className={`${inputCls} appearance-none pr-10`}>
        {children}
      </select>
      <ChevronDown
        size={18}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-warm"
      />
    </div>
  );
}
