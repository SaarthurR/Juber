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

export const dynamic = "force-dynamic";

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

  const supabase = await createClient();
  const contact = await getContact(supabase, user.id);
  const homeAddress = await getHomeAddress(supabase);
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
          {nextValues.length === 1 && <input type="hidden" name="next" value={safeNext} />}
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
            <FormField
              label="Saved home address (optional)"
              name="home_address"
              defaultValue={homeAddress ?? ""}
              placeholder="Only you can see this until you book with it"
              hint={`${setupRationale("home")} Drivers only see a copy when you request a seat with saved home.`}
              maxLength={500}
              ariaDescribedBy="profile-save-error"
            />
          </div>
        </div>

        {/* Preferred contact */}
        <div>
          <h2 className="mb-4 text-base font-extrabold text-ink">Preferred contact method</h2>
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
        </div>

        {/* Car info */}
        <div>
          <h2 className="mb-1 text-base font-extrabold text-ink">Car (optional)</h2>
          <p className="mb-4 text-xs font-medium text-stone-500">{setupRationale("vehicle")}</p>
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
        </div>

        {/* Bio */}
        <div>
          <h2 className="mb-4 text-base font-extrabold text-ink">About (optional)</h2>
          <FormField label="" name="bio" textarea defaultValue={profile?.bio ?? ""} placeholder="A short intro for other riders" />
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
