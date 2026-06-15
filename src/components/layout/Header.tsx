import React, { useEffect, useState } from 'react';
import { LogOut, User, Sun, Moon, AlertTriangle, Loader2, CheckCircle2, Search } from 'lucide-react';
import { useStore } from '../../data/store';
import { Tooltip } from '../ui/Tooltip';
import { GlobalSearch } from '../ui/GlobalSearch';
import { subscribeCloudSync, isFirebaseConfigured } from '../../data/firebase';

function CloudSyncBadge({ light }: { light: boolean }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const s = useStore(state => state.mainUiStrings);
  useEffect(() => subscribeCloudSync(setStatus), []);
  if (!isFirebaseConfigured) return null;
  if (status === 'idle') return null;
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium transition-all ${status === 'saved' ? 'text-green-400' : light ? 'text-gray-400' : 'text-gray-300'}`}>
      {status === 'saving'
        ? <><Loader2 size={13} className="animate-spin" /> {s.syncSaving}</>
        : <><CheckCircle2 size={13} /> {s.syncSaved}</>}
    </div>
  );
}


function TzviAirLogo() {
  return (
    <img
      src="/tzviair-logo.png"
      alt="TzviAir"
      className="flex-shrink-0"
      style={{ height: '40px', width: 'auto', display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.18))' }}
    />
  );
}


export function Header() {
  const { currentUser, logout, lightTheme, setLightTheme, firebaseSyncError, mainUiStrings: s,
          projects, currentProjectId, setCurrentProject } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    <header
      className="h-16 flex items-center justify-between px-5 shadow-lg flex-shrink-0 z-30 transition-colors duration-200"
      style={{ backgroundColor: lightTheme ? '#ffffff' : '#1e3a5f', borderBottom: lightTheme ? '1px solid #e5e7eb' : 'none' }}
    >
      <div className="flex items-center gap-4">
        <TzviAirLogo />
        <div className="w-px h-10" style={{ backgroundColor: lightTheme ? '#e5e7eb' : 'rgba(255,255,255,0.2)' }} />
        <div className="flex items-center gap-2">
          {projects.map(p => (
            <Tooltip key={p.id} text={p.name}>
              <button
                onClick={() => setCurrentProject(p.id)}
                className={`rounded-lg p-0.5 transition-all focus:outline-none ${
                  currentProjectId === p.id
                    ? 'ring-2 ring-[#4aa8d8] opacity-100'
                    : 'opacity-40 hover:opacity-70'
                }`}
              >
                <img src={p.logoPath} alt={p.name} className="h-9 w-auto rounded" style={{ objectFit: 'contain' }} />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <CloudSyncBadge light={lightTheme} />

        {currentUser && (
          <Tooltip text={s.searchTooltip}>
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
            >
              <Search size={17} />
            </button>
          </Tooltip>
        )}

        {/* Theme toggle */}
        <Tooltip text={lightTheme ? s.switchToDark : s.switchToLight}>
          <button
            onClick={() => setLightTheme(!lightTheme)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
          >
            {lightTheme ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </Tooltip>

        {currentUser && (
          <>
            <div className="text-right ml-1">
              <div className="text-sm font-medium" style={{ color: lightTheme ? '#1e3a5f' : 'white' }}>{currentUser.name}</div>
              <div className="text-xs" style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}>{currentUser.role}</div>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center border"
              style={{ backgroundColor: 'rgba(74,168,216,0.2)', borderColor: 'rgba(74,168,216,0.4)' }}>
              <User size={16} className="text-[#4aa8d8]" />
            </div>
            <Tooltip text={s.signOut}>
              <button
                onClick={logout}
                className="p-2 rounded-lg transition-colors"
                style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
              >
                <LogOut size={18} />
              </button>
            </Tooltip>
          </>
        )}
      </div>
    </header>
    {firebaseSyncError && (
      <div className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-red-600 text-white">
        <AlertTriangle size={15} className="flex-shrink-0" />
        <span>{firebaseSyncError}</span>
      </div>
    )}
</>
  );
}
