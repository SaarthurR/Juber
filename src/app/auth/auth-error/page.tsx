import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-bold">Sign-in didn&apos;t work</h1>
      <p className="text-stone-600">
        Something went wrong completing your sign-in. Please try again.
      </p>
      <Link
        href="/"
        className="rounded-full bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700"
      >
        Back home
      </Link>
    </div>
  );
}
