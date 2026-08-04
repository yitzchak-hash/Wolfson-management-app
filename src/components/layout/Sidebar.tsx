import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Building2, LayoutDashboard, FileText, Settings, Activity,
  TrendingUp, ClipboardList, Briefcase, CalendarDays,
} from 'lucide-react';
import { useStore } from '../../data/store';
import { projectColor } from '../../types';

/**
 * Per-project navigation.
 *
 * Everything here is scoped to the current workspace, including Project
 * Settings — which is simply another tab in the list, not a separate section.
 * App-wide settings (users, language, theme, backup) live in the header instead.
 *
 * The coloured rail down the left edge is the workspace identity cue: it is
 * visible on every page, so you can tell which project you are in from the
 * corner of your eye even while deep in Analytics or Reports.
 */
export function Sidebar() {
  const { lightTheme, mainUiStrings: s, currentProjectId, projects } = useStore();

  const isGeneral = currentProjectId === 'general';
  const accent = projectColor(projects, currentProjectId);

  const navItems = [
    isGeneral
      ? { to: '/jobs',     icon: Briefcase,       label: s.jobsNavLabel }
      : { to: '/project',  icon: Building2,       label: s.navProject },
    { to: '/dashboard',        icon: LayoutDashboard, label: s.navDashboard },
    { to: '/project-calendar', icon: CalendarDays,    label: s.navCalendar },
    { to: '/tasks',            icon: ClipboardList,   label: s.navTasks },
    { to: '/analytics',        icon: TrendingUp,      label: s.navAnalytics },
    { to: '/reports',          icon: FileText,        label: s.navReports },
    { to: '/activity',         icon: Activity,        label: s.navActivity },
    { to: '/settings',         icon: Settings,        label: s.navProjectSettings },
  ];

  return (
    <>
      {/* Phone: the sidebar becomes a bottom bar, which is where a thumb reaches.
          Hidden on md and up, where the vertical rail returns. */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch overflow-x-auto"
        style={{
          backgroundColor: lightTheme ? '#ffffff' : '#162d4a',
          borderTop: `3px solid ${accent}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} title={label}
            className="flex-1 min-w-[62px] flex flex-col items-center justify-center gap-0.5 py-2"
            style={({ isActive }) => (isActive
              ? { color: accent, fontWeight: 700 }
              : { color: lightTheme ? '#9ca3af' : '#6b7280' })}>
            <Icon size={19} />
            <span className="text-[8.5px] leading-none">{label}</span>
          </NavLink>
        ))}
      </nav>

    <div className="hidden md:flex flex-shrink-0 z-20">
      {/* Workspace identity rail */}
      <div style={{ width: '4px', backgroundColor: accent }} aria-hidden="true" />

      <aside
        className="w-16 flex flex-col items-center py-4 gap-1 transition-colors duration-200"
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
            className="flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all text-xs gap-1"
            style={({ isActive }) => (
              isActive
                ? { backgroundColor: accent, color: '#ffffff' }
                : { color: lightTheme ? '#9ca3af' : '#6b7280' }
            )}
          >
            <Icon size={20} />
            <span className="text-[9px] leading-none font-medium text-center px-0.5">{label}</span>
          </NavLink>
        ))}
      </aside>
    </div>
    </>
  );
}
