import { notFound } from "next/navigation";
import { unlockDemoModeAction } from "@/app/demo/actions";
import { localDemoUnlockEnabled } from "@/lib/demo/access";

export default function DemoUnlockPage() {
  if (!localDemoUnlockEnabled()) notFound();
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold text-ink">Open demo mode</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">Enter the local presenter passcode to load the isolated demo workspace.</p>
      <form action={unlockDemoModeAction} className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
        <label htmlFor="demo-passcode" className="block text-sm font-bold text-ink">Presenter passcode</label>
        <input id="demo-passcode" name="passcode" type="password" required minLength={32} autoComplete="current-password" className="min-h-11 w-full rounded-xl border border-stone-300 px-3" />
        <button className="min-h-11 w-full rounded-xl bg-brand-600 px-4 text-sm font-bold text-white">Open demo</button>
      </form>
    </div>
  );
}
