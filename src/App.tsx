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
import { TasksPage } from './pages/TasksPage';
import { GeneralJobsPage } from './pages/GeneralJobsPage';
import { GlobalCalendarPage } from './pages/GlobalCalendarPage';
import { ProjectCalendarPage } from './pages/ProjectCalendarPage';
import { TvPresentationPage } from './pages/TvPresentationPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser } = useStore();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
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
          {/* Analytics folded into the Dashboard — one page, nothing lost.
              The old address still works so a bookmark does not 404. */}
          <Route path="analytics" element={<Navigate to="/dashboard" replace />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="activity" element={<ActivityLogPage />} />
          <Route path="settings" element={<SettingsPage scope="project" />} />
          <Route path="app-settings" element={<SettingsPage scope="app" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
