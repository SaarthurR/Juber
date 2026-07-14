import {
  disableDemoModeAction,
  enableDemoModeAction,
  resetDemoModeAction,
} from "@/app/demo/actions";

export function DemoModeToggle({ active }: { active: boolean }) {
  return (
    <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-tint p-5">
      <div>
        <h2 className="font-bold text-ink">Demo mode</h2>
        <p className="mt-1 text-sm text-stone-600">
          {active ? "Using isolated, resettable sample data." : "Preview every workflow without paid services."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {active ? (
          <>
            <form action={resetDemoModeAction}>
              <button className="min-h-11 rounded-xl border border-brand-300 bg-white px-4 text-sm font-bold text-brand-700">Reset</button>
            </form>
            <form action={disableDemoModeAction}>
              <button role="switch" aria-checked="true" className="min-h-11 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white">On</button>
            </form>
          </>
        ) : (
          <form action={enableDemoModeAction}>
            <button role="switch" aria-checked="false" className="min-h-11 rounded-xl border border-brand-300 bg-white px-4 text-sm font-bold text-brand-700">Off</button>
          </form>
        )}
      </div>
    </section>
  );
}
