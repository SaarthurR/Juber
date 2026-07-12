import type { Metadata } from "next";
import { RouteProgressLink as Link } from "@/components/route-progress-link";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Terms of Service | ${APP_NAME}`,
  description: `Terms of service for ${APP_NAME}.`,
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand-600">
        Terms
      </p>
      <h1 className="mt-3 text-3xl font-extrabold text-stone-950">
        Terms of Service
      </h1>
      <p className="mt-3 text-sm text-stone-500">
        Last updated: June 16, 2026
      </p>

      <div className="mt-8 space-y-7 text-[15px] leading-7 text-stone-700">
        <section>
          <h2 className="text-lg font-bold text-stone-950">
            Using {APP_NAME}
          </h2>
          <p className="mt-2">
            {APP_NAME} helps community members coordinate carpools and ride
            sharing. By using the service, you agree to provide accurate
            information and use the app respectfully and lawfully.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-stone-950">
            Ride Coordination
          </h2>
          <p className="mt-2">
            Ride details are provided by community members. Drivers and riders
            are responsible for confirming timing, pickup locations, safety,
            eligibility, and any other ride arrangements directly with each
            other.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-stone-950">
            Community Conduct
          </h2>
          <p className="mt-2">
            Do not misuse the service, post misleading information, harass other
            users, attempt to access another user&apos;s account, or interfere
            with the operation of the app.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-stone-950">Availability</h2>
          <p className="mt-2">
            We may update, suspend, or discontinue parts of {APP_NAME} at any
            time. The service is provided as-is and without guarantees that it
            will always be available or error-free.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-stone-950">Contact</h2>
          <p className="mt-2">
            Questions about these terms can be sent to{" "}
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
