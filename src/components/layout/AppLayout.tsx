import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar, MobileNav } from './Sidebar';
import { useStore } from '../../data/store';
import { isFirebaseConfigured } from '../../data/firebase';
import { PlannerAskModal } from '../board/PlannerAskModal';

export function AppLayout() {
  const { startFirebaseSync, firebaseListening, mainUiStrings } = useStore();

  // If the user was already logged in (skipped the login page), Firebase sync
  // never gets triggered by the login action — start it here on first mount.
  useEffect(() => {
    if (isFirebaseConfigured && !firebaseListening) {
      startFirebaseSync();
    }
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
    </div>
  );
}
