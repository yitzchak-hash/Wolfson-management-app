import React from 'react';
import { LogOut, User, Sun, Moon } from 'lucide-react';
import { useStore } from '../../data/store';

function TzviAirLogo() {
  return (
    <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ backgroundColor: 'white', padding: '3px 10px' }}>
      <img
        src="/tzviair-logo.png"
        alt="TzviAir"
        style={{ height: '38px', width: 'auto', display: 'block' }}
      />
    </div>
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
  const { currentUser, logout, lightTheme, setLightTheme } = useStore();

  return (
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
        <button
          onClick={() => setLightTheme(!lightTheme)}
          title={lightTheme ? 'Switch to dark theme' : 'Switch to light theme'}
          className="p-2 rounded-lg transition-colors"
          style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
        >
          {lightTheme ? <Moon size={17} /> : <Sun size={17} />}
        </button>

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
            <button
              onClick={logout}
              title="Sign out"
              className="p-2 rounded-lg transition-colors"
              style={{ color: lightTheme ? '#6b7280' : '#9ca3af' }}
            >
              <LogOut size={18} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
