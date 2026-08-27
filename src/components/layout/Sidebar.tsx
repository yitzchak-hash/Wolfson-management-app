import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Building2, LayoutDashboard, FileText, Settings, Activity, Tv,
  TrendingUp, ClipboardList, Briefcase, CalendarDays, MoreHorizontal, TextSearch,
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
/** The per-workspace destinations, shared by the rail and the phone bar. */
function useNavItems() {
  const { mainUiStrings: s, currentProjectId } = useStore();
  const isGeneral = currentProjectId === 'general';
  return [
    isGeneral
      ? { to: '/jobs',     icon: Briefcase,       label: s.jobsNavLabel }
      : { to: '/project',  icon: Building2,       label: s.navProject },
    /**
     * No Goals tab here — the owner's ruling: the goals page lives on the TV
     * bar beside its Dashboard button, and on a computer the goals widget's
     * drawn styles open /goals. The route stands; the rail stays clean.
     */
    { to: '/dashboard',        icon: LayoutDashboard, label: s.navDashboard },
    { to: '/project-calendar', icon: CalendarDays,    label: s.navCalendar },
    { to: '/tasks',            icon: ClipboardList,   label: s.navTasks },
    { to: '/reports',          icon: FileText,        label: s.navReports },
    { to: '/activity',         icon: Activity,        label: s.navActivity },
    { to: '/settings',         icon: Settings,        label: s.navProjectSettings },
    /**
     * What the TV sees, from a computer.
     *
     * After a divider, because it is not another page of this workspace — it
     * is a look at a different screen, and arranging what goes on that screen
     * happens there rather than in a settings form.
     */
    { to: '/tv-view', icon: Tv, label: 'TV', divider: true },
  ];
}

export function Sidebar() {
  const { lightTheme, projects, currentProjectId } = useStore();
  const accent = projectColor(projects, currentProjectId);
  const navItems = useNavItems();

  return (
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
        {navItems.map(({ to, icon: Icon, label, divider }) => (
          <React.Fragment key={to}>
          {divider && (
            <span className="my-1.5 h-px w-8"
              style={{ backgroundColor: lightTheme ? '#e2e8f0' : 'rgba(255,255,255,.16)' }} />
          )}
          <NavLink
            to={to}
            title={label}
            className={({ isActive }) =>
              // 52 rather than 48: a 20px icon, a label and the gap between
              // them did not fit in 48, so the fill's edge ran through the word.
              `pick flex flex-col items-center justify-center w-[52px] h-[52px] rounded-xl text-xs gap-1 ${isActive ? 'pick-on' : ''}`}
            style={({ isActive }) => ({
              ['--pick-fill' as string]: accent,
              color: isActive ? '#ffffff' : (lightTheme ? '#9ca3af' : '#6b7280'),
            })}
          >
            <Icon size={20} />
            <span className="text-[9px] leading-[1.1] font-medium text-center px-0.5">{label}</span>
          </NavLink>
          </React.Fragment>
        ))}
      </aside>
    </div>
  );
}

/**
 * Phone navigation.
 *
 * A normal flex child at the bottom of the app column, NOT `fixed bottom-0`.
 * On mobile browsers 100vh is the viewport with the URL bar hidden — 899px on a
 * 844px screen here — so a fixed bar anchored to it sat 55px below the fold and
 * was simply unreachable. In the flow of a 100dvh column it cannot be wrong.
 *
 * Eight destinations do not fit across 390px, so four live on the bar and the
 * rest are one tap away behind More — a sheet, not a hidden sideways scroll.
 */
export function MobileNav() {
  const { lightTheme, mainUiStrings: s, currentProjectId, projects } = useStore();
  const accent = projectColor(projects, currentProjectId);
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const navItems = useNavItems();
  /**
   * The job LIST is a phone destination, spliced in here rather than added to
   * useNavItems: on a desktop the board and the diagram ARE the list, so the
   * sidebar deliberately never shows it. Second slot — right next to the
   * board/diagram it is the other reading of.
   */
  const withList = [
    navItems[0],
    { to: '/list', icon: TextSearch, label: 'List' },
    ...navItems.slice(1),
  ];
  // Five plus More, not four: the List tab must not cost Tasks its place on
  // the bar. Six slots at 390px is 65px each — snug, still tappable.
  const primary = withList.slice(0, 5);
  const overflow = withList.slice(5);
  const overflowActive = overflow.some(i => pathname.startsWith(i.to));

  return (
    <>
      <nav
        className="md:hidden flex items-stretch flex-shrink-0 z-40"
        style={{
          backgroundColor: lightTheme ? '#ffffff' : '#162d4a',
          borderTop: `3px solid ${accent}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {primary.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} title={label}
            className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2"
            style={({ isActive }) => (isActive
              ? { color: accent, fontWeight: 700 }
              : { color: lightTheme ? '#9ca3af' : '#6b7280' })}>
            <Icon size={20} />
            <span className="text-[9px] leading-none truncate max-w-full px-0.5">{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2"
          style={{ color: overflowActive ? accent : (lightTheme ? '#9ca3af' : '#6b7280'),
                   fontWeight: overflowActive ? 700 : 400 }}
        >
          <MoreHorizontal size={20} />
          <span className="text-[9px] leading-none">{s.moreLabel}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            onClick={e => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl p-3 pb-6"
            style={{ backgroundColor: lightTheme ? '#ffffff' : '#162d4a', borderTop: `3px solid ${accent}` }}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3" />
            <div className="grid grid-cols-4 gap-2">
              {overflow.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `pick flex flex-col items-center justify-center gap-1 py-3 rounded-xl ${isActive ? 'pick-on' : ''}`}
                  style={({ isActive }) => ({
                    ['--pick-fill' as string]: accent,
                    color: isActive ? '#ffffff' : (lightTheme ? '#6b7280' : '#9ca3af'),
                    backgroundColor: isActive ? undefined : (lightTheme ? '#f8fafc' : 'rgba(255,255,255,.05)'),
                  })}>
                  <Icon size={20} />
                  <span className="text-[10px] leading-none text-center">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
