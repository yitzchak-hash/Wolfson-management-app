import React, { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar, MobileNav } from './Sidebar';
import { useStore, ensureProjectSnapshot } from '../../data/store';
import { isFirebaseConfigured } from '../../data/firebase';
import { PlannerAskModal } from '../board/PlannerAskModal';
import { UndoLayer } from '../board/UndoLayer';

export function AppLayout() {
  const { startFirebaseSync, firebaseListening, mainUiStrings } = useStore();
  const currentProjectId = useStore(st => st.currentProjectId);
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * THE BACK BUTTON KNOWS WHICH WORKSPACE YOU WERE IN.
   *
   * Routes never carried the workspace — /tasks is /tasks in Wolfson and on
   * the Job Board — so pressing Back walked the ROUTES you had visited while
   * leaving you standing in whatever workspace you happened to be in now:
   * "back" did not take you back to what you actually saw. Every history
   * entry is therefore STAMPED with the workspace it was viewed in
   * (`location.state.ws`), and going back or forward restores it.
   *
   * This is the STAMP half: a new entry (navigation) is stamped in place
   * (replace, so no extra history), and a workspace switch that arrives with
   * NO navigation pushes one entry so Back has something to return to. The
   * RESTORE half lives in workspaceHistory.ts — a popstate listener that must
   * be registered BEFORE the router's (see the comment there for why).
   */
  const lastLocKey = useRef<string>('');
  const lastWs = useRef<string>(currentProjectId);
  useEffect(() => {
    const state = (location.state ?? null) as { ws?: string } | null;
    const moved = lastLocKey.current !== location.key;
    lastLocKey.current = location.key;
    const here = location.pathname + location.search + location.hash;
    if (moved) {
      if (!state?.ws) {
        navigate(here, { replace: true, state: { ...(state ?? {}), ws: currentProjectId } });
      }
      // A pop onto another workspace's entry was already restored by the
      // popstate listener below — before this effect ever ran.
      lastWs.current = currentProjectId;
      return;
    }
    if (lastWs.current !== currentProjectId) {
      // The store switched and this render's location has not — YET. On an
      // ordinary header switch the store's commit lands one render BEFORE the
      // router's (navigate() is wrapped in startTransition), so pushing here
      // immediately minted a phantom entry (old route, new workspace) that
      // Back landed on. Two defences, both needed: the cleanup cancels the
      // push when a navigation re-runs this effect, and the timer checks the
      // REAL address — React Router writes window.history synchronously at
      // navigate(), long before the transition renders, and a heavy workspace
      // switch can hold that transition past any reasonable delay.
      const ws = currentProjectId;
      lastWs.current = currentProjectId;
      const t = setTimeout(() => {
        const real = window.location.pathname + window.location.search + window.location.hash;
        if (real !== here) return;   // a navigation already carried the stamp
        navigate(here, { state: { ...(state ?? {}), ws } });
      }, 150);
      return () => clearTimeout(t);
    }
    lastWs.current = currentProjectId;
  }, [location, currentProjectId]);


  // If the user was already logged in (skipped the login page), Firebase sync
  // never gets triggered by the login action — start it here on first mount.
  useEffect(() => {
    if (isFirebaseConfigured && !firebaseListening) {
      startFirebaseSync();
    }
  }, []);

  /**
   * Pull down the OTHER workspaces' snapshots when this machine has none —
   * a cleared browser or a brand-new computer otherwise leaves Building
   * Progress, the workspace miniatures and every unit card saying "not opened
   * on this device yet" while the data sits in Firestore. Once per session;
   * a workspace already cached locally is left untouched.
   */
  useEffect(() => {
    const { projects, currentProjectId } = useStore.getState();
    projects.filter(p => p.id !== currentProjectId)
      .forEach(p => void ensureProjectSnapshot(p.id));
  }, []);

  return (
    // 100dvh, not 100vh. On a mobile browser 100vh is the viewport with the URL
    // bar HIDDEN — 899px on an 844px screen — so the page ran past the fold and
    // anything anchored to the bottom was unreachable. dvh tracks what is
    // actually visible; the vh line stays as a fallback for old browsers.
    <div
      className="flex flex-col bg-gray-100 overflow-x-hidden"
      style={{ height: '100vh', maxHeight: '100dvh', minHeight: '100dvh' }}
      dir={mainUiStrings.isRtl ? 'rtl' : 'ltr'}
    >
      <Header />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        {/* A flex COLUMN, not a plain block.
            Pages whose root is `flex-1 flex flex-col min-h-0` — the board, the
            calendar, anything with its own internal scroll — need a parent that
            can hand them a definite height. As a block, `main` sized itself to
            its content, so `flex-1` on the page root resolved against zero free
            space and the board's viewport collapsed to 0px: laid out, but
            clipped away by its own overflow-hidden and invisible.
            Ordinary long pages still scroll, because a flex item with
            content-based min-height will not shrink below its content. */}
        {/* min-w-0 matters as much as min-h-0 and was missing.
            A flex item defaults to min-width:auto, so <main> could never be
            narrower than its content's min-content width — on a phone the
            settings page laid itself out at 527px inside a 390px screen and
            everything ran off the right edge. The pages that looked fine were
            simply the ones whose min-content happened to be small. */}
        <main className="flex-1 min-h-0 min-w-0 overflow-auto flex flex-col">
          <Outlet />
        </main>
      </div>
      {/* In the flow of the column, so it can never sit below the fold. */}
      <MobileNav />
      {/* "This job is on the planner — what should the planner do about the
          task you just saved?" Rendered here so the question reaches the
          office from any page; the worker portal never mounts this layout,
          so a worker is never asked about the office's planner. */}
      <PlannerAskModal />
      {/* Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, and the question that guards anything
          putting real content back. Here rather than on the board so the keys
          work on every page, and so a question raised on the board is still
          answerable after navigating away from it. */}
      <UndoLayer />
    </div>
  );
}
