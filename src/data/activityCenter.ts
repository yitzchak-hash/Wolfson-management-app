/**
 * THE JOB BOARD IS THE ACTIVITY CENTRE (owner, 2026-10-05): "I don't see the
 * activity here. I go to Wolfson — this is the activity that he did, it's
 * because it's in the Wolfson project, it's not in the job board. I think
 * the job board should be the general activity center; also it should have
 * all the activity."
 *
 * Each workspace's log lives in its own collection, and the store holds only
 * the open workspace's. This module fetches the OTHER workspaces' newest
 * records — and only when the Activity page is opened on the Job Board,
 * never at app load: Firestore reads cost money (the read diet), and nobody
 * else needs them. One fetch per workspace per session, kept here; the page's
 * refresh button asks again. The page always lays each workspace's LOCAL
 * snapshot beside the answer (free, and it holds what this machine did there
 * a minute ago); without Firebase that snapshot is all there is.
 *
 * Session-only module state, never persisted and never part of the store —
 * a copy of the cloud, not the office's data, so it stays out of persist,
 * export, import and the backup audit.
 */
import { useSyncExternalStore } from 'react';
import type { ActivityLog } from '../types';
import { fsGetAllRecent, projectCollection, isFirebaseConfigured } from './firebase';

/** The same 200 every workspace keeps of its own log. */
export const CENTER_FETCH_N = 200;

interface Fetched {
  logs: ActivityLog[];
  /** When the answer arrived — the page says "as of 14:02". */
  at: number;
}

const fetched = new Map<string, Fetched>();
const inflight = new Map<string, Promise<void>>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(fn => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Re-render when a fetch starts or lands. */
export function useActivityCenterVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

/** What the cloud last said about a workspace's activity this session, if anything. */
export function fetchedActivity(projectId: string): Fetched | undefined {
  return fetched.get(projectId);
}

export function isFetchingActivity(projectId: string): boolean {
  return inflight.has(projectId);
}

/**
 * Fetch the newest records of each workspace named — once per session unless
 * `force`. A workspace already fetched (or in flight) costs nothing. A
 * failed read leaves the previous answer standing; `fsGetAllRecent` answers
 * an empty list on failure, which the page then backs with the local
 * snapshot rather than showing a workspace as having done nothing.
 */
export function fetchActivityFor(projectIds: string[], force = false): Promise<void> {
  if (!isFirebaseConfigured) return Promise.resolve();
  const jobs: Promise<void>[] = [];
  for (const pid of projectIds) {
    const running = inflight.get(pid);
    if (running) { jobs.push(running); continue; }
    if (!force && fetched.has(pid)) continue;
    const p = fsGetAllRecent(projectCollection(pid, 'activityLogs'), 'createdAt', CENTER_FETCH_N)
      .then(docs => {
        const logs = (docs as unknown as ActivityLog[])
          .filter(l => !!l && typeof l.createdAt === 'string');
        // An empty answer after a non-empty one is a failed read, not a
        // workspace whose history vanished — keep what we had.
        const prev = fetched.get(pid);
        if (logs.length || !prev) fetched.set(pid, { logs, at: Date.now() });
      })
      .catch(() => { /* the previous answer, or the local snapshot, stands */ })
      .finally(() => { inflight.delete(pid); emit(); });
    inflight.set(pid, p);
    jobs.push(p);
  }
  if (jobs.length) emit();
  return Promise.all(jobs).then(() => undefined);
}
