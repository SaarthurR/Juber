import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateProfile } from "@/app/profile/actions";
import { FormField, SubmitButton } from "@/components/form-bits";
import { Avatar } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const { user, profile } = await getCurrentUser();
  if (!user) redirect("/");

  const preferredContact = profile?.preferred_contact ?? "message";

  const radioBase =
    "flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 border-stone-300 text-stone-700 hover:bg-stone-50";

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-4">
        <Avatar src={profile?.avatar_url} name={profile?.full_name} size={56} />
        <div>
          <h1 className="text-2xl font-bold">Your profile</h1>
          <p className="text-sm text-stone-500">
            Contact info is visible to signed-in members so they can coordinate rides.
          </p>
        </div>
      </div>

      <form action={updateProfile} className="space-y-5">
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
        <FormField label="Phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} />
        <FormField
          label="Instagram handle (optional)"
          name="instagram"
          defaultValue={profile?.instagram ? `@${profile.instagram}` : ""}
          placeholder="e.g. @yourhandle"
        />

        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-stone-700">
            Preferred contact method
          </legend>
          <div className="flex flex-wrap gap-2">
            <label className={radioBase}>
              <input
                type="radio"
                name="preferred_contact"
                value="phone"
                defaultChecked={preferredContact === "phone"}
                className="sr-only"
              />
              Phone
            </label>
            <label className={radioBase}>
              <input
                type="radio"
                name="preferred_contact"
                value="instagram"
                defaultChecked={preferredContact === "instagram"}
                className="sr-only"
              />
              Instagram
            </label>
            <label className={radioBase}>
              <input
                type="radio"
                name="preferred_contact"
                value="message"
                defaultChecked={preferredContact === "message"}
                className="sr-only"
              />
              In-app message
            </label>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Car make / model"
            name="car_make_model"
            defaultValue={profile?.car_make_model ?? ""}
            placeholder="Toyota Sienna"
          />
          <FormField
            label="Car color"
            name="car_color"
            defaultValue={profile?.car_color ?? ""}
            placeholder="Silver"
          />
        </div>
        <FormField label="Bio (optional)" name="bio" textarea defaultValue={profile?.bio ?? ""} />
        <SubmitButton>Save profile</SubmitButton>
      </form>

      <form action="/auth/signout" method="post" className="mt-6 text-center">
        <button className="text-sm font-medium text-stone-500 hover:text-red-600">
          Sign out
        </button>
      </form>
    </div>
  );
}
