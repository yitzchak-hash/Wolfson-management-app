import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useStore } from '../../data/store';
import { isFirebaseConfigured } from '../../data/firebase';

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
    <div className="flex flex-col h-screen bg-gray-100" dir={mainUiStrings.isRtl ? 'rtl' : 'ltr'}>
      <Header />
      <div className="flex flex-1 overflow-hidden pb-[62px] md:pb-0">
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
        <main className="flex-1 min-h-0 overflow-auto flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
