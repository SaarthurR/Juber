import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getContact } from "@/lib/contact";
import { updateProfile } from "@/app/profile/actions";
import { FormField, SubmitButton } from "@/components/form-bits";
import { AvatarUploader } from "@/components/avatar-uploader";
import { authCallbackDestination } from "@/lib/route-targets";

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

  const supabase = await createClient();
  const contact = await getContact(supabase, user.id);
  const preferredContact = profile?.preferred_contact ?? "message";

  const radioBase =
    "flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition has-[:checked]:border-brand-600 has-[:checked]:bg-tint has-[:checked]:text-brand-700 border-[#e2ddd5] text-stone-600 hover:bg-stone-50";

  return (
    <div className="mx-auto flex max-w-4xl flex-wrap-reverse gap-12 px-4 py-10 sm:px-6">
      <form action={updateProfile} className="min-w-[300px] max-w-[560px] flex-[2] space-y-8">
        {nextValues.length === 1 && <input type="hidden" name="next" value={safeNext} />}
        <div>
          <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Edit profile</h1>
          <div className="mt-5 h-px bg-[#efece6]" />
        </div>

        {(sp.onboarding === "1" || sp.contact_required === "1") && (
          <div className="rounded-xl border border-brand-200 bg-tint px-4 py-3 text-sm font-semibold text-brand-700">
            Add a phone or WhatsApp number to continue using Juber.
          </div>
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
          <h2 className="mb-4 text-base font-extrabold text-ink">Contact</h2>
          <div className="space-y-4">
            <FormField label="Phone" name="phone" type="tel" defaultValue={contact.phone ?? ""} />
            <FormField
              label="WhatsApp number"
              name="whatsapp"
              type="tel"
              defaultValue={contact.whatsapp ?? ""}
              placeholder="e.g. +1 555 555 5555"
            />
            <p className="text-xs font-medium text-stone-500">At least one contact number is required.</p>
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
          <h2 className="mb-4 text-base font-extrabold text-ink">Car</h2>
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

        <SubmitButton>Save changes</SubmitButton>

        <div className="border-t border-[#efece6] pt-5 text-center">
          <button
            formAction="/auth/signout"
            formMethod="post"
            className="text-sm text-stone-400 transition hover:text-red-500"
          >
            Sign out
          </button>
        </div>
      </form>

      {/* Avatar column */}
      <div className="flex min-w-[200px] flex-1 flex-col items-center pt-2 sm:pt-14">
        <AvatarUploader
          userId={user.id}
          name={profile?.full_name ?? null}
          initialUrl={profile?.avatar_url ?? null}
          size={120}
        />
      </div>
    </div>
  );
}
