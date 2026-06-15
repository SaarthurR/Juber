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
    "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 border-stone-200 text-stone-600 hover:bg-stone-50";

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <div className="mb-1 flex items-center gap-4">
        <Avatar src={profile?.avatar_url} name={profile?.full_name} size={44} />
        <h1 className="text-3xl font-bold text-stone-900">Edit Profile</h1>
      </div>
      <hr className="my-5 border-stone-200" />

      <form action={updateProfile} className="space-y-8">
        {/* Personal Information */}
        <div>
          <h2 className="mb-4 font-bold text-stone-900">Personal Information</h2>
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
          <h2 className="mb-4 font-bold text-stone-900">Contact</h2>
          <div className="space-y-4">
            <FormField label="Phone (optional)" name="phone" type="tel" defaultValue={profile?.phone ?? ""} />
            <FormField
              label="Instagram handle (optional)"
              name="instagram"
              defaultValue={profile?.instagram ? `@${profile.instagram}` : ""}
              placeholder="e.g. @yourhandle"
            />
          </div>
        </div>

        {/* Preferred contact */}
        <div>
          <h2 className="mb-4 font-bold text-stone-900">Preferred contact method</h2>
          <div className="flex flex-wrap gap-2">
            <label className={radioBase}>
              <input type="radio" name="preferred_contact" value="phone" defaultChecked={preferredContact === "phone"} className="sr-only" />
              Phone
            </label>
            <label className={radioBase}>
              <input type="radio" name="preferred_contact" value="instagram" defaultChecked={preferredContact === "instagram"} className="sr-only" />
              Instagram
            </label>
            <label className={radioBase}>
              <input type="radio" name="preferred_contact" value="message" defaultChecked={preferredContact === "message"} className="sr-only" />
              In-app message
            </label>
          </div>
        </div>

        {/* Car info */}
        <div>
          <h2 className="mb-4 font-bold text-stone-900">Car</h2>
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
          <h2 className="mb-4 font-bold text-stone-900">About (optional)</h2>
          <FormField label="" name="bio" textarea defaultValue={profile?.bio ?? ""} placeholder="A short intro for other riders" />
        </div>

        <SubmitButton>Save</SubmitButton>
      </form>

      <form action="/auth/signout" method="post" className="mt-6 text-center">
        <button className="text-sm text-stone-400 hover:text-red-500 transition">
          Sign out
        </button>
      </form>
    </div>
  );
}
