import { useSyncExternalStore } from 'react';
import { useStore, loadProjectSnapshot } from './store';
import { isUploadBackendConfigured, extractFolderId } from './driveApi';

/**
 * WHAT MOVED IN DRIVE (owner, 2026-09-07: the Active-jobs widget "should
 * check every hour the latest activity in the drive folders … that way if
 * anything updates there it's recent activity really").
 *
 * Once an hour (and on arrival) the app asks Drive for every file changed in
 * the last thirty days, with each file's ancestor folders, and pins the
 * newest change onto the JOB whose folder it lives in — a photo dropped into
 * Job/Photos, a plan into Job/Engineered Plans. The answer is kept per
 * machine (`drive_activity` in localStorage): it is derived from Drive, not
 * the office's data, so it stays out of the store, the export and Firestore.
 * The Active-jobs widget reads it through `useDriveActivity()`.
 */
const API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';
const KEY = 'drive_activity';
export const DRIVE_ACTIVITY_EVERY_MS = 60 * 60 * 1000;
export const DRIVE_ACTIVITY_DAYS = 30;

export interface DriveActivity {
  /** When this machine last asked. */
  at: string;
  /** Job folder id → the newest change inside it. */
  byFolder: Record<string, { at: string; name: string }>;
}

let current: DriveActivity | null = null;
try { current = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { current = null; }
const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }
export function driveActivity(): DriveActivity | null { return current; }
export function useDriveActivity(): DriveActivity | null {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current);
}

/** The newest Drive change inside this job's folder, if any is known. */
export function driveActivityFor(driveLink?: string | null): { at: string; name: string } | null {
  if (!current || !driveLink) return null;
  const id = extractFolderId(driveLink);
  return id ? current.byFolder[id] ?? null : null;
}

export function driveActivityDue(now = Date.now()): boolean {
  if (!API_KEY || !isUploadBackendConfigured()) return false;
  const last = current?.at ? Date.parse(current.at) : 0;
  return now - last >= DRIVE_ACTIVITY_EVERY_MS;
}

let running: Promise<DriveActivity | null> | null = null;
export function refreshDriveActivity(): Promise<DriveActivity | null> {
  if (running) return running;
  running = doRefresh().finally(() => { running = null; });
  return running;
}

async function doRefresh(): Promise<DriveActivity | null> {
  if (!API_KEY || !isUploadBackendConfigured()) return null;
  // Every job folder the office has, in every workspace — the map a changed
  // file is matched against through its ancestors.
  const st = useStore.getState();
  const folders = new Set<string>();
  const pids = [...new Set([...st.projects.map(p => p.id), 'general'])];
  for (const pid of pids) {
    const apts = pid === st.currentProjectId ? st.apartments : loadProjectSnapshot(pid).apartments;
    for (const a of apts) { const id = a.driveLink ? extractFolderId(a.driveLink) : null; if (id) folders.add(id); }
  }
  if (!folders.size) return null;
  try {
    const since = new Date(Date.now() - DRIVE_ACTIVITY_DAYS * 86400000).toISOString();
    const resp = await fetch('/api/drive-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ recent: { since } }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { files?: { id: string; name: string; modifiedTime: string; ancestors?: string[] }[] };
    const byFolder: DriveActivity['byFolder'] = {};
    for (const f of data.files ?? []) {
      if (!f.modifiedTime) continue;
      for (const anc of f.ancestors ?? []) {
        if (!folders.has(anc)) continue;
        const cur = byFolder[anc];
        if (!cur || f.modifiedTime > cur.at) byFolder[anc] = { at: f.modifiedTime, name: f.name };
        break;
      }
    }
    current = { at: new Date().toISOString(), byFolder };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* full */ }
    emit();
    return current;
  } catch {
    return null;
  }
}

/** For harnesses: forget what this machine knows. */
export function __resetDriveActivity() { current = null; try { localStorage.removeItem(KEY); } catch { /* */ } emit(); }
