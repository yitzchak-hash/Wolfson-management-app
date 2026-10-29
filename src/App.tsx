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
import { previewInfo, israelTime, restoreThisBackup, leavePreview } from './data/previewMode';
import { Loader2 } from 'lucide-react';

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
 * that nothing done here is saved, and — for Tzvi and the developer — the
 * Restore press, which asks first in plain words with the numbers.
 */
const WS_NAME: Record<string, string> = { wolfson: 'Wolfson', general: 'Job Board', netiv: 'Netiv' };
function PreviewBar() {
  const p = previewInfo();
  const role = useStore(st => st.currentUser?.role ?? '');
  const [ask, setAsk] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<null | { ok: boolean; put?: number; removed?: number; safetyBackup?: string | null; error?: string }>(null);
  if (!p) return null;
  const when = israelTime(p.exportedAt);
  const mayRestore = role === 'Boss' || role === 'Dev';
  const which = p.kind === 'old' ? `${WS_NAME[p.workspaces[0]] ?? p.workspaces[0]} only` : 'every workspace';
  const go = async () => {
    setBusy(true);
    const r = await restoreThisBackup();
    setBusy(false); setAsk(false); setDone(r);
  };
  return (
    <>
      <div role="status" className="fixed inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm"
        style={{ zIndex: 2147483000, background: '#fffbeb', borderTop: '2px solid #f59e0b', color: '#92400e', paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))' }}>
        <span className="font-semibold">Preview of the backup from {when}</span>
        <span>{which} · {p.totalDocuments.toLocaleString()} records · nothing you do here is saved</span>
        {mayRestore && (
          <button onClick={() => setAsk(true)} className="inline-flex items-center min-h-[32px] px-3 rounded-lg font-medium text-white" style={{ background: '#1e3a5f' }}>
            Restore this backup
          </button>
        )}
        <button onClick={() => window.close()} className="inline-flex items-center min-h-[32px] px-3 rounded-lg font-medium border bg-white" style={{ borderColor: '#e5e7eb', color: '#4b5563' }}>
          Close preview
        </button>
      </div>
      {(ask || done) && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2147483001, background: 'rgba(17,24,39,.45)' }}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md bg-white rounded-2xl p-5 grid gap-4" style={{ boxShadow: '0 20px 50px rgba(0,0,0,.25)', color: '#111827' }}>
            {ask && !done && (
              <>
                <h2 className="text-base font-semibold" style={{ color: '#1f2937' }}>Restore the backup from {when}?</h2>
                <p className="text-sm">
                  {p.kind === 'old'
                    ? <>The {WS_NAME[p.workspaces[0]] ?? p.workspaces[0]} workspace becomes exactly as it was then. The other workspaces are not touched.</>
                    : <>The whole app becomes exactly as it was then, in every workspace.</>}
                  {' '}Anything added after it is removed, and anything changed goes back.
                </p>
                <ul className="text-sm grid gap-1">
                  {p.counts.map(c => (
                    <li key={c.ws}><b>{WS_NAME[c.ws] ?? c.ws}:</b> {c.jobs.toLocaleString()} {c.ws === 'general' ? 'jobs' : 'flats'}, {c.widgets} board items, {c.tasks} tasks</li>
                  ))}
                </ul>
                <p className="text-sm" style={{ color: '#4b5563' }}>Before anything changes, a backup of how things are right now is saved to Drive, so this can be undone.</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={() => setAsk(false)} disabled={busy} className="min-h-[36px] px-4 rounded-lg border text-sm font-medium" style={{ borderColor: '#e5e7eb', color: '#4b5563' }}>Keep things as they are</button>
                  <button onClick={go} disabled={busy} className="inline-flex items-center gap-2 min-h-[36px] px-4 rounded-lg text-sm font-medium text-white" style={{ background: '#b91c1c' }}>
                    {busy && <Loader2 size={16} className="animate-spin" />}
                    {busy ? 'Restoring…' : `Restore ${which}`}
                  </button>
                </div>
              </>
            )}
            {done && done.ok && (
              <>
                <h2 className="text-base font-semibold" style={{ color: '#15803d' }}>Restored</h2>
                <p className="text-sm">The app is now as it was on {when}: {done.put?.toLocaleString()} records put back, {done.removed?.toLocaleString()} newer ones removed.</p>
                {done.safetyBackup && <p className="text-sm" style={{ color: '#4b5563' }}>How things were just before is saved in Drive as <span className="font-mono text-xs">{done.safetyBackup}</span>.</p>}
                <div className="flex justify-end"><button onClick={leavePreview} className="min-h-[36px] px-4 rounded-lg text-sm font-medium text-white" style={{ background: '#1e3a5f' }}>Open the app</button></div>
              </>
            )}
            {done && !done.ok && (
              <>
                <h2 className="text-base font-semibold" style={{ color: '#b91c1c' }}>Nothing was restored</h2>
                <p className="text-sm">{done.error}</p>
                <div className="flex justify-end"><button onClick={() => setDone(null)} className="min-h-[36px] px-4 rounded-lg border text-sm font-medium" style={{ borderColor: '#e5e7eb', color: '#4b5563' }}>Back to the preview</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </>
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
