import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Privacy Policy | ${APP_NAME}`,
  description: `Privacy policy for ${APP_NAME}.`,
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand-600">
        Privacy
      </p>
      <h1 className="mt-3 text-3xl font-extrabold text-stone-950">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-stone-500">
        Last updated: June 16, 2026
      </p>

      <div className="mt-8 space-y-7 text-[15px] leading-7 text-stone-700">
        <section>
          <h2 className="text-lg font-bold text-stone-950">
            Information We Collect
          </h2>
          <p className="mt-2">
            {APP_NAME} collects the information needed to help community members
            coordinate rides, including your name, email address, profile
            details, ride posts, ride requests, messages, notifications, and
            basic sign-in information from Google when you choose Google sign-in.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-stone-950">
            How We Use Information
          </h2>
          <p className="mt-2">
            We use this information to create and manage your account, show ride
            listings, connect drivers and riders, send service notifications,
            protect the service, and improve the experience for the community.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-stone-950">
            Sharing Information
          </h2>
          <p className="mt-2">
            We do not sell your personal information. Information you add to
            ride posts, requests, profiles, or messages may be visible to other
            signed-in users as needed to coordinate rides.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-stone-950">Data Security</h2>
          <p className="mt-2">
            We use reasonable technical and organizational measures to protect
            account and ride information. No online service can guarantee
            complete security.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-stone-950">Your Choices</h2>
          <p className="mt-2">
            You can update your profile information in the app. To request
            account deletion or ask privacy questions, contact us at{" "}
            <a
              href="mailto:hello@jcnc.org"
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              hello@jcnc.org
            </a>
            .
          </p>
        </section>
      </div>

      <Link
        href="/"
        className="mt-10 inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        Back to {APP_NAME}
      </Link>
    </main>
  );
}
