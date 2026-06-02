import React from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, LayoutDashboard, FileText, Settings, Activity, TrendingUp, ClipboardList } from 'lucide-react';
import { useStore } from '../../data/store';

export function Sidebar() {
  const { lightTheme, mainUiStrings: s } = useStore();

  const navItems = [
    { to: '/project',   icon: Building2,      label: s.navProject },
    { to: '/dashboard', icon: LayoutDashboard, label: s.navDashboard },
    { to: '/tasks',     icon: ClipboardList,   label: s.navTasks },
    { to: '/analytics', icon: TrendingUp,      label: s.navAnalytics },
    { to: '/reports',   icon: FileText,        label: s.navReports },
    { to: '/activity',  icon: Activity,        label: s.navActivity },
    { to: '/settings',  icon: Settings,        label: s.navSettings },
  ];

  return (
    <aside
      className="w-16 flex flex-col items-center py-4 gap-1 flex-shrink-0 z-20 transition-colors duration-200"
      style={{
        backgroundColor: lightTheme ? '#f8fafc' : '#162d4a',
        borderRight: lightTheme ? '1px solid #e5e7eb' : 'none',
      }}
    >
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all text-xs gap-1 ${
              isActive
                ? lightTheme
                  ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]'
                  : 'bg-[#4aa8d8]/20 text-[#4aa8d8]'
                : lightTheme
                  ? 'text-gray-400 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/5'
                  : 'text-gray-500 hover:text-white hover:bg-white/10'
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
