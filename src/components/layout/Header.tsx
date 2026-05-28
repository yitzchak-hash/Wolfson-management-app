import React from 'react';
import { LogOut, User } from 'lucide-react';
import { useStore } from '../../data/store';

function TzviAirLogo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Swoosh SVG matching actual TzviAir logo */}
      <svg width="48" height="34" viewBox="0 0 48 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Orange top arc */}
        <path d="M4 6 Q24 -2 44 6" stroke="#f5a623" strokeWidth="3" strokeLinecap="round" fill="none"/>
        {/* Yellow second arc */}
        <path d="M6 11 Q24 3 42 11" stroke="#f9c840" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        {/* Light blue third arc */}
        <path d="M8 16 Q24 9 40 16" stroke="#4aa8d8" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        {/* Dark blue bottom arc */}
        <path d="M10 21 Q24 15 38 21" stroke="#1e6fa5" strokeWidth="2" strokeLinecap="round" fill="none"/>
      </svg>
      <div>
        <div className="leading-none">
          <span className="text-xl font-extrabold tracking-tight text-white" style={{ fontStyle: 'italic' }}>
            Tzvi
          </span>
          <span className="text-xl font-extrabold tracking-tight text-[#4aa8d8]" style={{ fontStyle: 'italic' }}>
            Air
          </span>
        </div>
        <div className="text-[9px] text-gray-400 tracking-[0.18em] uppercase mt-0.5 leading-none">
          Air Conditioning Engineering
        </div>
      </div>
    </div>
  );
}

function WolfsonLogo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* W mark — copper/bronze color on light background */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: '#d6e8ee' }}
      >
        <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
          {/* The W shape with serif-like look */}
          <path
            d="M2 3 L7 19 L14 8 L21 19 L26 3"
            stroke="#b8860b"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <div>
        <div className="text-[11px] font-semibold tracking-[0.22em] text-[#d6e8ee] leading-tight uppercase">
          Wolfson
        </div>
        <div className="text-[8px] tracking-[0.15em] text-gray-400 uppercase leading-tight">
          Residence
        </div>
        <div className="text-[7px] tracking-[0.1em] text-gray-500 uppercase leading-tight">
          by the Wolfson Group
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const { currentUser, logout } = useStore();

  return (
    <header className="bg-[#1e3a5f] text-white h-16 flex items-center justify-between px-5 shadow-lg flex-shrink-0 z-30">
      {/* Left: logos */}
      <div className="flex items-center gap-5">
        <TzviAirLogo />

        <div className="w-px h-10 bg-white/20" />

        <WolfsonLogo />
      </div>

      {/* Right: user */}
      {currentUser && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium">{currentUser.name}</div>
            <div className="text-xs text-gray-400">{currentUser.role}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#4aa8d8]/25 flex items-center justify-center border border-[#4aa8d8]/40">
            <User size={16} className="text-[#4aa8d8]" />
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-300 hover:text-white"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  );
}
