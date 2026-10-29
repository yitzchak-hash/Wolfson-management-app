import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './data/store';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { CrashScreen } from './components/ui/CrashScreen';
import { ProjectDiagramPage } from './pages/ProjectDiagramPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { ContractorPortal } from './pages/ContractorPortal';
import { TvViewPage } from './pages/TvViewPage';
import { TasksPage } from './pages/TasksPage';
import { GeneralJobsPage } from './pages/GeneralJobsPage';
import { JobListPage } from './pages/JobListPage';
import GoalsPage from './pages/GoalsPage';
import { CalendarPage } from './pages/CalendarPage';
import { TvPresentationPage } from './pages/TvPresentationPage';
import { armWorkspaceHistoryRestore } from './data/workspaceHistory';
import { previewInfo } from './data/previewMode';

// Before the router can subscribe to popstate — see workspaceHistory.ts.
armWorkspaceHistoryRestore();

/**
 * The front door (owner, 2026-09-16): the bare domain IS the Job Board.
 *
 * The index route used to say `Navigate to="/jobs"`, and the board's own
 * guard then sent anyone whose browser last held Wolfson or Netiv on to
 * `/project` — so the domain by itself opened whatever workspace the machine
 * happened to remember, and on a machine remembering a workspace with
 * nothing to show, nothing. A URL is a destination: "/" means the board, so
 * the workspace is switched to `general` BEFORE the board route renders, or
 * its guard would bounce the arrival straight back out.
 */
function Home() {
  const currentProjectId = useStore(st => st.currentProjectId);
  const setCurrentProject = useStore(st => st.setCurrentProject);
  React.useLayoutEffect(() => {
    if (currentProjectId !== 'general') setCurrentProject('general');
  }, [currentProjectId, setCurrentProject]);
  if (currentProjectId !== 'general') return null;
  return <Navigate to="/jobs" replace />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser } = useStore();
  const location = useLocation();
  // The gate remembers the URL it bounced — the login page returns there,
  // switching workspace to match. Landing by last-used workspace instead of
  // the address somebody actually opened is what made "the job board URL"
  // show Wolfson until a second click.
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/**
 * Enter saves. Everywhere.
 *
 * Nearly every field in this app commits on BLUR — the drawer's own note says
 * so — which is right for somebody moving between fields with the mouse and
 * quietly wrong for somebody typing: you finish a family name, press Enter,
 * nothing happens, and you cannot tell whether it saved. Rather than adding a
 * key handler to a hundred inputs and missing the hundred-and-first, Enter on a
 * single-line field simply takes the focus off it, which runs the save the
 * field already has.
 *
 * Left alone: a textarea (Enter is a new line there), a field inside a real
 * form (the browser submits it), anything that has already handled the key
 * itself (`defaultPrevented`), and the type-ahead controls where Enter means
 * "pick this" rather than "done".
 */
function useEnterCommits() {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (!el || el.tagName !== 'INPUT') return;
      const input = el as HTMLInputElement;
      const type = (input.type || 'text').toLowerCase();
      if (['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'reset'].includes(type)) return;
      if (input.hasAttribute('data-enter-own') || input.closest('form')) return;
      input.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * The bar across a backup PREVIEW tab (previewMode.ts): which backup this is,
 * and that nothing done here is saved.
 */
function PreviewBar() {
  const p = previewInfo();
  if (!p) return null;
  const when = new Date(p.exportedAt).toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div style={{ position: 'fixed', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 2147483000 }}
      className="flex items-center gap-3 rounded-full bg-amber-400 text-amber-950 shadow-lg px-4 py-1.5 text-sm font-semibold">
      <span>PREVIEW of the backup from {when} · {p.totalDocuments.toLocaleString()} records · nothing you do here is saved</span>
      <button onClick={() => window.close()} className="rounded-full bg-amber-950 text-amber-50 px-3 py-0.5 text-xs">Close preview</button>
    </div>
  );
}

export default function App() {
  useEnterCommits();
  return (
    <CrashScreen>
    <PreviewBar />
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Public contractor portal — no auth */}
        <Route path="/c/:token" element={<ContractorPortal />} />
        {/* Wall display. Public link, ALWAYS read-only — it can never edit. */}
        <Route path="/tv" element={<TvPresentationPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          {/* Home is the Job Board — the app's front door, not a project tile */}
          <Route index element={<Home />} />
          <Route path="project" element={<ProjectDiagramPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          {/* The whole goals website, as a tab — computer only, never the TV */}
          <Route path="goals" element={<GoalsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          {/* ONE calendar (owner, 2026-10-12): the old per-workspace address lands on it */}
          <Route path="project-calendar" element={<Navigate to="/calendar" replace />} />
          <Route path="jobs" element={<GeneralJobsPage />} />
          {/* The phone's answer to the board: every job as a searchable list.
              Linked from the bottom bar; the desktop sidebar leaves it out. */}
          <Route path="list" element={<JobListPage />} />
          {/* Analytics folded into the Dashboard — one page, nothing lost.
              The old address still works so a bookmark does not 404. */}
          <Route path="analytics" element={<Navigate to="/dashboard" replace />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="activity" element={<ActivityLogPage />} />
          {/* What the TV sees, and where the wall is arranged — from a PC. */}
          <Route path="tv-view" element={<TvViewPage />} />
          <Route path="settings" element={<SettingsPage scope="project" />} />
          <Route path="app-settings" element={<SettingsPage scope="app" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </CrashScreen>
  );
}
