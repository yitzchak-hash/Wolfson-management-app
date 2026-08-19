import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './data/store';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
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
import { GlobalCalendarPage } from './pages/GlobalCalendarPage';
import { ProjectCalendarPage } from './pages/ProjectCalendarPage';
import { TvPresentationPage } from './pages/TvPresentationPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser } = useStore();
  if (!currentUser) return <Navigate to="/login" replace />;
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

export default function App() {
  useEnterCommits();
  return (
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
          <Route index element={<Navigate to="/jobs" replace />} />
          <Route path="project" element={<ProjectDiagramPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="calendar" element={<GlobalCalendarPage />} />
          {/* Per-project calendar (sidebar); /calendar stays the all-workspace one */}
          <Route path="project-calendar" element={<ProjectCalendarPage />} />
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
  );
}
