import { redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getContact } from "@/lib/contact";
import { getHomeAddress } from "@/lib/home-address";
import { buildSetupProgress } from "@/lib/setup-progress";
import { updateProfileMobile } from "@/app/m/actions";
import { SubHeader } from "@/components/mobile/sub-header";
import { AvatarUploader } from "@/components/avatar-uploader";
import { ProfileForm } from "@/components/profile-form";
import { ProfileSetupPanel, setupRationale } from "@/components/profile-setup-panel";
import { authCallbackDestination } from "@/lib/route-targets";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full min-h-11 rounded-xl border border-border bg-white px-3.5 py-3 text-[14px] text-ink outline-none placeholder:text-muted-warm focus:border-brand-600 focus:ring-2 focus:ring-brand-100";

const ONBOARDING_WELCOME_BODY =
  "A quick profile helps drivers and riders coordinate pickup. You can browse rides now and finish contact info when you are ready to book or post.";

function Caption({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[12px] font-semibold text-muted">{children}</span>;
}

export default async function MobileEditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    onboarding?: string;
    contact_required?: string;
    next?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const { user, profile } = await getCurrentUser();
  if (!user) redirect("/m");
  const fallback = "/m/profile";
  const nextValues = Array.isArray(sp.next)
    ? sp.next
    : sp.next === undefined
      ? []
      : [sp.next];
  const safeNext = authCallbackDestination(
    nextValues.length === 1 ? nextValues[0] : null,
    fallback,
  );
  const setupMode =
    sp.onboarding === "1"
      ? "onboarding"
      : sp.contact_required === "1"
        ? "contact_required"
        : null;

  const supabase = await createClient();
  const { data: places } = await supabase
    .from("places")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });
  const neighborhoods = ((places as Place[]) ?? []).filter((p) => p.kind !== "event");
  const options = neighborhoods.length ? neighborhoods : ((places as Place[]) ?? []);

  const contact = await getContact(supabase, user.id);
  const homeAddress = await getHomeAddress(supabase);
  const progress = buildSetupProgress({
    fullName: profile?.full_name,
    avatarUrl: profile?.avatar_url,
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    homeAddress,
    carMakeModel: profile?.car_make_model,
  });

  const fullName = (profile?.full_name ?? "").trim();
  const parts = fullName ? fullName.split(/\s+/) : [];
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : fullName;
  const preferred = profile?.preferred_contact ?? "message";
  const hasNeighborhood = options.some((p) => p.name === profile?.neighborhood);

  const hiddenNext =
    nextValues.length === 1 ? (
      <input type="hidden" name="next" value={safeNext} />
    ) : null;

  const nameFields = (
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
  );

  const contactFields = (
    <div className="space-y-3.5">
      <label className="block">
        <Caption>Phone</Caption>
        <input
          name="phone"
          type="tel"
          defaultValue={contact.phone ?? ""}
          placeholder="(555) 555-5555"
          className={inputCls}
        />
      </label>
      <label className="block">
        <Caption>WhatsApp</Caption>
        <input
          name="whatsapp"
          type="tel"
          defaultValue={contact.whatsapp ?? ""}
          placeholder="+1 555 555 5555"
          className={inputCls}
        />
      </label>
      <p className="text-[12px] font-medium text-muted-warm">
        At least one contact number is required to book or post.
      </p>
    </div>
  );

  const preferredContactField = (
    <label className="block">
      <Caption>Preferred contact method</Caption>
      <SelectWithChevron name="preferred_contact" defaultValue={preferred}>
        <option value="phone">Phone</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="message">In-app message</option>
      </SelectWithChevron>
    </label>
  );

  const homeField = (
    <label className="block">
      <Caption>Saved home address (optional)</Caption>
      <input
        name="home_address"
        defaultValue={homeAddress ?? ""}
        placeholder="Only you can see this until you book with it"
        maxLength={500}
        aria-describedby="profile-save-error"
        className={inputCls}
      />
      <p className="mt-1.5 text-[11px] text-muted-warm">
        {setupRationale("home")} Drivers only see a copy when you request a seat with saved home.
      </p>
    </label>
  );

  const avatarFields = (
    <>
      <AvatarUploader
        userId={user.id}
        name={profile?.full_name ?? null}
        initialUrl={profile?.avatar_url ?? null}
        size={96}
        tone="brand"
      />
      <p className="-mt-2 text-center text-[11px] font-medium text-muted-warm">
        Your Google photo is a starting point. Change it anytime.
      </p>
    </>
  );

  const vehicleField = (
    <label className="block">
      <Caption>Car make &amp; model (optional)</Caption>
      <input
        name="car_make_model"
        defaultValue={profile?.car_make_model ?? ""}
        placeholder="Toyota Sienna"
        className={inputCls}
      />
      <p className="mt-1.5 text-[11px] text-muted-warm">{setupRationale("vehicle")}</p>
    </label>
  );

  if (setupMode === "onboarding") {
    return (
      <ProfileForm
        action={updateProfileMobile}
        variant="mobile"
        className="pb-8"
        mode="onboarding"
        skipHref={safeNext}
        steps={[
          {
            key: "welcome",
            title: "Welcome to Juber",
            description: ONBOARDING_WELCOME_BODY,
            content: null,
          },
          {
            key: "name",
            title: "Your name",
            description: "How should other riders know you?",
            content: nameFields,
          },
          {
            key: "contact",
            title: "How can riders reach you?",
            description: setupRationale("contact"),
            content: (
              <>
                {contactFields}
                {preferredContactField}
              </>
            ),
          },
          {
            key: "photo",
            title: "Add a profile photo",
            description: "Help drivers and riders recognize you.",
            optional: true,
            content: avatarFields,
          },
          {
            key: "home",
            title: "Save your home address",
            description: setupRationale("home"),
            optional: true,
            content: homeField,
          },
          {
            key: "vehicle",
            title: "Your car",
            description: setupRationale("vehicle"),
            optional: true,
            content: vehicleField,
          },
        ]}
      >
        {hiddenNext}
        <SubHeader title="Set up your profile" backFallback="/m/profile" />
      </ProfileForm>
    );
  }

  return (
    <ProfileForm
      action={updateProfileMobile}
      variant="mobile"
      className="pb-28"
      mode={setupMode ?? "edit"}
      skipHref={setupMode ? safeNext : undefined}
    >
      {hiddenNext}
      <SubHeader
        title={setupMode ? "Set up your profile" : "Edit profile"}
        backFallback="/m/profile"
      />

      <div className="space-y-7 px-4 pt-2">
        {setupMode && (
          <ProfileSetupPanel
            mode={setupMode}
            progress={progress}
            skipHref={safeNext}
            variant="mobile"
          />
        )}
        {/* Avatar uploader */}
        <AvatarUploader
          userId={user.id}
          name={profile?.full_name ?? null}
          initialUrl={profile?.avatar_url ?? null}
          size={96}
          tone="brand"
        />
        <p className="-mt-4 text-center text-[11px] font-medium text-muted-warm">
          Your Google photo is a starting point. Change it anytime.
        </p>

        {/* Personal information */}
        <section>
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
            Personal information
          </h2>
          {nameFields}
        </section>

        {/* Contact */}
        <section>
          <h2 className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-600">
            Contact
          </h2>
          <p className="mb-3 text-[12px] font-medium text-muted-warm">{setupRationale("contact")}</p>
          <div className="space-y-3.5">
            <label className="block">
              <Caption>Phone</Caption>
              <input
                name="phone"
                type="tel"
                defaultValue={contact.phone ?? ""}
                placeholder="(555) 555-5555"
                className={inputCls}
              />
            </label>
            <label className="block">
              <Caption>WhatsApp</Caption>
              <input
                name="whatsapp"
                type="tel"
                defaultValue={contact.whatsapp ?? ""}
                placeholder="+1 555 555 5555"
                className={inputCls}
              />
            </label>
            <p className="text-[12px] font-medium text-muted-warm">
              At least one contact number is required to book or post.
            </p>
            <label className="block">
              <Caption>Saved home address (optional)</Caption>
              <input
                name="home_address"
                defaultValue={homeAddress ?? ""}
                placeholder="Only you can see this until you book with it"
                maxLength={500}
                aria-describedby="profile-save-error"
                className={inputCls}
              />
              <p className="mt-1.5 text-[11px] text-muted-warm">
                {setupRationale("home")} Drivers only see a copy when you request a seat with saved home.
              </p>
            </label>
            <label className="block">
              <Caption>Car make &amp; model (optional)</Caption>
              <input
                name="car_make_model"
                defaultValue={profile?.car_make_model ?? ""}
                placeholder="Toyota Sienna"
                className={inputCls}
              />
              <p className="mt-1.5 text-[11px] text-muted-warm">{setupRationale("vehicle")}</p>
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
    </ProfileForm>
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
