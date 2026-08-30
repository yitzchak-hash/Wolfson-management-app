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


  /**
   * NAV WATCH — a diagnostic for the owner's "the sidebar buttons don't do
   * anything" report, which no replay of his data reproduces. Armed only by
   * opening the site with `?debugnav=1`. It watches every in-app link click:
   * if 1.5s later the address has not reached the link's target, a red
   * banner paints what actually happened — where the click landed, what the
   * address says, the history entry's stamp, fullscreen state, and the last
   * few page errors — so the fault names itself on the one machine that
   * shows it. Zero cost when the flag is absent.
   */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debugnav')) return;
    const errs: string[] = [];
    const onErr = (e: ErrorEvent) => { errs.push(String(e.message ?? e).slice(0, 180)); };
    const onRej = (e: PromiseRejectionEvent) => { errs.push(('rejection: ' + String(e.reason)).slice(0, 180)); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const a = el.closest?.('a[href^="/"]') as HTMLAnchorElement | null;
      const hitDesc = (() => {
        const at = document.elementFromPoint(e.clientX, e.clientY);
        if (!at) return 'nothing';
        const cls = String((at as HTMLElement).className ?? '').split(' ').slice(0, 3).join('.');
        return `${at.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
      })();
      if (!a) return;
      const target = a.getAttribute('href') ?? '';
      const from = window.location.pathname;
      if (!target || target === from) return;
      window.setTimeout(() => {
        const now = window.location.pathname;
        if (now !== from) return;    // the navigation happened — all good
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;'
          + 'background:#dc2626;color:#fff;padding:10px 14px;border-radius:12px;'
          + 'font:600 12px/1.5 system-ui;white-space:pre-wrap;cursor:pointer;direction:ltr';
        d.textContent = 'NAV WATCH — the click did not navigate.\n'
          + `clicked: ${target}   still on: ${now}\n`
          + `click landed on: ${hitDesc}\n`
          + `history stamp: ${JSON.stringify(window.history.state ?? null).slice(0, 160)}\n`
          + `fullscreen: ${!!document.fullscreenElement}   `
          + `errors: ${errs.slice(-3).join(' | ') || 'none'}\n`
          + '(tap this banner to dismiss — send a photo of it to Claude)';
        d.onclick = () => d.remove();
        document.body.appendChild(d);
        window.setTimeout(() => d.remove(), 60000);
      }, 1500);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

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
