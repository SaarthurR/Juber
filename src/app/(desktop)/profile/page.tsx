import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getContact } from "@/lib/contact";
import { getHomeAddress } from "@/lib/home-address";
import { buildSetupProgress } from "@/lib/setup-progress";
import { updateProfile } from "@/app/profile/actions";
import { FormField } from "@/components/form-bits";
import { ProfileForm } from "@/components/profile-form";
import { ProfileSetupPanel, setupRationale } from "@/components/profile-setup-panel";
import { AvatarUploader } from "@/components/avatar-uploader";
import { authCallbackDestination } from "@/lib/route-targets";
import { SignOutForm } from "@/components/sign-out-form";
import { GooglePlaceInput } from "@/components/google-place-input";
import { getDemoRuntime } from "@/lib/demo/runtime";

export const dynamic = "force-dynamic";

const ONBOARDING_WELCOME_BODY =
  "A quick profile helps drivers and riders coordinate pickup. You can browse rides now and finish contact info when you are ready to book or post.";

export default async function EditProfilePage({
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
  if (!user) redirect("/");
  const fallback = `/profile/${user.id}`;
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

  const demo = await getDemoRuntime();
  let contact: { phone: string | null; whatsapp: string | null };
  let homeAddress: string | null;
  if (demo) {
    const demoContact = demo.state.contacts[user.id];
    contact = {
      phone: demoContact?.phone ?? null,
      whatsapp: demoContact?.whatsapp ?? null,
    };
    homeAddress = demoContact?.homeAddress ?? null;
  } else {
    const supabase = await createClient();
    contact = await getContact(supabase, user.id);
    homeAddress = await getHomeAddress(supabase);
  }
  const preferredContact = profile?.preferred_contact ?? "message";
  const progress = buildSetupProgress({
    fullName: profile?.full_name,
    avatarUrl: profile?.avatar_url,
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    homeAddress,
    carMakeModel: profile?.car_make_model,
  });

  const radioBase =
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition has-[:checked]:border-brand-600 has-[:checked]:bg-tint has-[:checked]:text-brand-700 border-[#e2ddd5] text-stone-600 hover:bg-stone-50";

  const hiddenNext =
    nextValues.length === 1 ? (
      <input type="hidden" name="next" value={safeNext} />
    ) : null;

  const nameFields = (
    <div className="space-y-4">
      <FormField label="Name" name="full_name" defaultValue={profile?.full_name ?? ""} required />
      <FormField
        label="Pronouns (optional)"
        name="pronouns"
        defaultValue={profile?.pronouns ?? ""}
        placeholder="e.g. she/her"
      />
      <FormField
        label="Neighborhood / city"
        name="neighborhood"
        defaultValue={profile?.neighborhood ?? ""}
        placeholder="e.g. Fremont"
      />
    </div>
  );

  const contactFields = (
    <div className="space-y-4">
      <FormField label="Phone" name="phone" type="tel" defaultValue={contact.phone ?? ""} />
      <FormField
        label="WhatsApp number"
        name="whatsapp"
        type="tel"
        defaultValue={contact.whatsapp ?? ""}
        placeholder="e.g. +1 555 555 5555"
      />
      <p className="text-xs font-medium text-stone-500">At least one contact number is required to book or post.</p>
    </div>
  );

  const preferredContactFields = (
    <div className="flex flex-wrap gap-2">
      <label className={radioBase}>
        <input type="radio" name="preferred_contact" value="phone" defaultChecked={preferredContact === "phone"} className="sr-only" />
        Phone
      </label>
      <label className={radioBase}>
        <input type="radio" name="preferred_contact" value="whatsapp" defaultChecked={preferredContact === "whatsapp"} className="sr-only" />
        WhatsApp
      </label>
      <label className={radioBase}>
        <input type="radio" name="preferred_contact" value="message" defaultChecked={preferredContact === "message"} className="sr-only" />
        In-app message
      </label>
    </div>
  );

  const homeField = (
    <label className="block">
      <span className="mb-1 block text-[15px] font-bold text-ink">
        Saved home address (optional)
      </span>
      <span className="mb-2.5 block text-[13px] text-[#a8a29e]">
        {setupRationale("home")} Drivers only see a copy when you request a seat with saved home.
      </span>
      <GooglePlaceInput
        name="home_address"
        label="Saved home address"
        initialValue={homeAddress ?? ""}
        placeholder="Search for your home address"
        maxLength={500}
        ariaDescribedBy="profile-save-error"
        manualFallback
        className="w-full rounded-xl border border-[#e2ddd5] px-3.5 py-3 text-[15px] outline-none placeholder:text-[#a8a29e] focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );

  const avatarFields = (
    <div className="flex flex-col items-center">
      <AvatarUploader
        userId={user.id}
        name={profile?.full_name ?? null}
        initialUrl={profile?.avatar_url ?? null}
        size={120}
      />
      <p className="mt-3 max-w-[280px] text-center text-xs font-medium text-stone-500">
        Your Google photo is a starting point. Change it anytime.
      </p>
    </div>
  );

  const vehicleFields = (
    <div className="grid grid-cols-2 gap-4">
      <FormField
        label="Make / model"
        name="car_make_model"
        defaultValue={profile?.car_make_model ?? ""}
        placeholder="Toyota Sienna"
      />
      <FormField
        label="Color"
        name="car_color"
        defaultValue={profile?.car_color ?? ""}
        placeholder="Silver"
      />
    </div>
  );

  const bioField = (
    <FormField label="" name="bio" textarea defaultValue={profile?.bio ?? ""} placeholder="A short intro for other riders" />
  );

  if (setupMode === "onboarding") {
    return (
      <div className="mx-auto px-4 py-10 sm:px-6">
        <ProfileForm
          action={updateProfile}
          variant="desktop"
          className="space-y-8"
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
                  {preferredContactFields}
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
              content: (
                <>
                  {vehicleFields}
                  <div>
                    <p className="mb-4 text-xs font-medium text-stone-500">About (optional)</p>
                    {bioField}
                  </div>
                </>
              ),
            },
          ]}
        >
          {hiddenNext}
        </ProfileForm>
        <div className="mx-auto mt-8 w-full max-w-[480px]">
          <SignOutForm variant="desktop" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-wrap-reverse gap-12 px-4 py-10 sm:px-6">
      <div className="min-w-[300px] max-w-[560px] flex-[2]">
        <ProfileForm
          action={updateProfile}
          variant="desktop"
          className="space-y-8"
          mode={setupMode ?? "edit"}
          skipHref={setupMode ? safeNext : undefined}
        >
          {hiddenNext}
          <div>
            <h1 className="text-[30px] font-extrabold tracking-tight text-ink">
              {setupMode ? "Set up your profile" : "Edit profile"}
            </h1>
            <div className="mt-5 h-px bg-[#efece6]" />
          </div>

          {setupMode && (
            <ProfileSetupPanel
              mode={setupMode}
              progress={progress}
              skipHref={safeNext}
              variant="desktop"
            />
          )}

        {/* Personal Information */}
        <div>
          <h2 className="mb-4 text-base font-extrabold text-ink">Personal information</h2>
          {nameFields}
        </div>

        {/* Contact */}
        <div>
          <h2 className="mb-1 text-base font-extrabold text-ink">Contact</h2>
          <p className="mb-4 text-xs font-medium text-stone-500">{setupRationale("contact")}</p>
          <div className="space-y-4">
            <FormField label="Phone" name="phone" type="tel" defaultValue={contact.phone ?? ""} />
            <FormField
              label="WhatsApp number"
              name="whatsapp"
              type="tel"
              defaultValue={contact.whatsapp ?? ""}
              placeholder="e.g. +1 555 555 5555"
            />
            <p className="text-xs font-medium text-stone-500">At least one contact number is required to book or post.</p>
            {homeField}
          </div>
        </div>

        {/* Preferred contact */}
        <div>
          <h2 className="mb-4 text-base font-extrabold text-ink">Preferred contact method</h2>
          {preferredContactFields}
        </div>

        {/* Car info */}
        <div>
          <h2 className="mb-1 text-base font-extrabold text-ink">Car (optional)</h2>
          <p className="mb-4 text-xs font-medium text-stone-500">{setupRationale("vehicle")}</p>
          {vehicleFields}
        </div>

        {/* Bio */}
        <div>
          <h2 className="mb-4 text-base font-extrabold text-ink">About (optional)</h2>
          {bioField}
        </div>

        </ProfileForm>

        <SignOutForm variant="desktop" />
      </div>

      {/* Avatar column */}
      <div className="flex min-w-[200px] flex-1 flex-col items-center pt-2 sm:pt-14">
        <AvatarUploader
          userId={user.id}
          name={profile?.full_name ?? null}
          initialUrl={profile?.avatar_url ?? null}
          size={120}
        />
        <p className="mt-3 max-w-[200px] text-center text-xs font-medium text-stone-500">
          Your Google photo is a starting point. Change it anytime.
        </p>
      </div>
    </div>
  );
}
