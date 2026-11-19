import { useStore } from './store';

/**
 * THE RESTORE HALF of workspace-aware browser history. (The STAMP half — every
 * history entry recording which workspace it was viewed in, under
 * `location.state.ws` — lives in AppLayout, which is the only place that can
 * see React Router's location.)
 *
 * On Back or Forward this reads the arriving entry's stamp and switches the
 * store to that workspace, so "back" returns to what you actually saw — not
 * just the route you were on, standing in whatever workspace you are in now.
 *
 * WHY THIS IS A MODULE-SCOPE LISTENER AND NOT AN EFFECT IN AppLayout:
 * listener order on one event is registration order, and React Router's
 * history subscription flushes its React update SYNCHRONOUSLY inside ITS
 * popstate listener (useSyncExternalStore, to avoid tearing). A listener
 * registered after the router mounts therefore runs AFTER a full render of
 * the popped route — by which point the /jobs ↔ /project redirect guards
 * have already seen the stale workspace and bounced the navigation,
 * replacing the popped entry and losing its stamp. Registering at module
 * load — before ReactDOM ever renders, so before the router can subscribe —
 * puts the restore FIRST: the store is switched before the router's own
 * sync render, and the popped route mounts with the right workspace already
 * in place.
 */
let armed = false;
let lastProject = '';
export function armWorkspaceHistoryRestore(): void {
  if (armed) return;   // HMR re-imports must not stack listeners
  armed = true;
  window.addEventListener('popstate', () => {
    // React Router keeps an entry's user state under history.state.usr.
    const ws = (window.history.state?.usr as { ws?: string } | undefined)?.ws;
    const st = useStore.getState();
    if (!ws || ws === st.currentProjectId) return;
    // BACK NEVER MOVES BETWEEN TWO PROJECTS (owner, 2026-11-19: "it never supposed to change project between Netiv
    // and Wolfson. It's always supposed to stay in the same project till physically I change, no matter what").
    // Back may still take him between the Job Board and a project — those are different pages — but standing in
    // Wolfson, an older entry that was looked at in Netiv is shown in Wolfson.
    if (ws !== 'general' && st.currentProjectId !== 'general') return;
    // Coming back from the Job Board: to the project he was last in, whatever the old entry says.
    st.setCurrentProject(ws !== 'general' && lastProject ? lastProject : ws);
  });
  // The project he was last in (never the Job Board), for the way back from the board.
  const note = (id: string) => { if (id && id !== 'general') lastProject = id; };
  note(useStore.getState().currentProjectId);
  useStore.subscribe(s => note(s.currentProjectId));
}
