import React from 'react';
import { LogOut, User } from 'lucide-react';
import { useStore } from '../../data/store';

export function Header() {
  const { currentUser, logout } = useStore();

  return (
    <header className="bg-[#1e3a5f] text-white h-16 flex items-center justify-between px-6 shadow-lg flex-shrink-0 z-30">
      {/* Left: TzviAir brand */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg width="44" height="32" viewBox="0 0 44 32" fill="none">
              <path d="M22 4 C14 4 6 12 2 28" stroke="#f5a623" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <path d="M22 4 C30 4 38 12 42 28" stroke="#4aa8d8" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <path d="M22 4 C22 12 22 20 22 28" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <div>
            <span className="text-xl font-bold tracking-wide">
              <span className="text-white">Tzvi</span>
              <span className="text-[#4aa8d8]">Air</span>
            </span>
            <div className="text-[10px] text-gray-300 leading-none tracking-widest uppercase">HVAC Engineering</div>
          </div>
        </div>

        <div className="w-px h-10 bg-white/20 mx-2" />

        {/* Wolfson project brand */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-[#d6e8ee] flex items-center justify-center">
            <span className="text-[#b8860b] font-bold text-lg leading-none">W</span>
          </div>
          <div>
            <div className="text-sm font-semibold tracking-widest text-[#d6e8ee]">WOLFSON</div>
            <div className="text-[10px] text-gray-400 tracking-wider uppercase">Project Management</div>
          </div>
        </div>
      </div>

      {/* Right: user info */}
      {currentUser && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium">{currentUser.name}</div>
            <div className="text-xs text-gray-400">{currentUser.role}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#4aa8d8]/30 flex items-center justify-center border border-[#4aa8d8]/50">
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
