import React from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, LayoutDashboard, FileText, Settings, Activity } from 'lucide-react';

const navItems = [
  { to: '/project', icon: Building2, label: 'Project' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="w-16 bg-[#162d4a] flex flex-col items-center py-4 gap-1 flex-shrink-0 z-20">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all text-xs gap-1 ${
              isActive
                ? 'bg-[#4aa8d8]/20 text-[#4aa8d8]'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`
          }
        >
          <Icon size={20} />
          <span className="text-[9px] leading-none font-medium">{label}</span>
        </NavLink>
      ))}
    </aside>
  );
}
