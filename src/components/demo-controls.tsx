import {
  disableDemoModeAction,
  resetDemoModeAction,
  switchDemoActorAction,
} from "@/app/demo/actions";
import type { DemoSession } from "@/lib/demo/types";

export function DemoControls({ session }: { session: DemoSession }) {
  const actors = Object.values(session.state.profiles).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  return (
    <aside className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950" aria-label="Demo controls">
      <strong>Demo mode</strong>
      <form action={switchDemoActorAction} className="flex items-center gap-2">
        <label htmlFor="demo-actor" className="font-semibold">View as</label>
        <select id="demo-actor" name="actorId" defaultValue={session.activeActorId} className="min-h-9 rounded-lg border border-amber-300 bg-white px-2">
          {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.full_name ?? "Incomplete profile"}</option>)}
        </select>
        <button className="min-h-9 rounded-lg bg-amber-900 px-3 font-bold text-white">Switch</button>
      </form>
      <form action={resetDemoModeAction}><button className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 font-bold">Reset</button></form>
      <form action={disableDemoModeAction}><button className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 font-bold">Exit</button></form>
    </aside>
  );
}
