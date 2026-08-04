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
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
