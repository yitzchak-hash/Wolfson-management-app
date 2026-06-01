import React from 'react';
import { LogOut, User, Sun, Moon, AlertTriangle } from 'lucide-react';
import { useStore } from '../../data/store';
import { Tooltip } from '../ui/Tooltip';

const FREE_TIER_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const WARN_THRESHOLD  = FREE_TIER_BYTES * 0.8;   // warn at 80%

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

function WolfsonLogo() {
  return (
    <img
      src="/wolfson-building.png"
      alt="W Residence by the Wolfson Group"
      className="h-11 w-auto rounded flex-shrink-0"
      style={{ objectFit: 'contain' }}
    />
  );
}

export function Header() {
  const { currentUser, logout, lightTheme, setLightTheme, totalStorageBytes, firebaseSyncError } = useStore();
  const storageGB = totalStorageBytes / 1024 / 1024 / 1024;
  const showStorageWarning = currentUser && totalStorageBytes >= WARN_THRESHOLD;

  return (
    <>
    <header
      className="h-16 flex items-center justify-between px-5 shadow-lg flex-shrink-0 z-30 transition-colors duration-200"
      style={{ backgroundColor: lightTheme ? '#ffffff' : '#1e3a5f', borderBottom: lightTheme ? '1px solid #e5e7eb' : 'none' }}
    >
      <div className="flex items-center gap-5">
        <TzviAirLogo />
        <div className="w-px h-10" style={{ backgroundColor: lightTheme ? '#e5e7eb' : 'rgba(255,255,255,0.2)' }} />
        <WolfsonLogo />
      </div>

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <Tooltip text={lightTheme ? 'Switch to dark theme' : 'Switch to light theme'}>
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
            <Tooltip text="Sign out">
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
    {showStorageWarning && (
      <div className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-amber-500 text-white">
        <AlertTriangle size={15} className="flex-shrink-0" />
        <span>
          Firebase Storage at {Math.round(storageGB * 10) / 10} GB of 5 GB free limit
          ({Math.round((totalStorageBytes / FREE_TIER_BYTES) * 100)}%).
          Ask your developer to upgrade the Firebase plan before it fills up.
        </span>
      </div>
    )}
    </>
  );
}
