import { useSyncExternalStore } from 'react';
import { fetchPlanBytes } from './driveApi';

/**
 * The plan bytes, kept IN MEMORY while the viewer or studio is open.
 *
 * A job's Engineered Plans folder usually holds a handful of sheets, and the
 * office flips between them — every flip used to be a full download. The cache
 * holds each file's bytes once, and a background chain downloads the folder's
 * OTHER plans one at a time the moment one of them is opened, so switching
 * tabs is near-instant.
 *
 * Two rules, both deliberate:
 * - **The copies are thrown away when the last viewer closes**
 *   (`releasePlanCache`) — nothing piles up on the machine; the TAB LIST is
 *   what survives, and the plans download again next time.
 * - **pdf.js is never handed the cached buffer itself.** getDocument TRANSFERS
 *   its input to the worker, which neuters the buffer — handing it the cache's
 *   copy would empty the cache on first use. Every read hands out a fresh
 *   `slice(0)`.
 */
const bytes = new Map<string, ArrayBuffer>();
/** 0..99 while a file is on its way down. Done files leave this map. */
const progress = new Map<string, number>();
const inflight = new Map<string, Promise<ArrayBuffer>>();
const listeners = new Set<() => void>();
let queue: string[] = [];
let pumping = false;
let mounts = 0;

function notify() { for (const l of listeners) l(); }

export function subscribePlanCache(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** 100 = here, opens instantly · 0..99 = downloading · null = not started. */
export function planDownloadState(id: string): number | null {
  if (bytes.has(id)) return 100;
  return progress.get(id) ?? null;
}

/** For the tab strip and the picker rows — re-renders as downloads move. */
export function usePlanDownload(id: string): number | null {
  return useSyncExternalStore(subscribePlanCache, () => planDownloadState(id));
}

export function fetchPlanCached(
  id: string,
  onProgress?: (b: number, t: number | null) => void,
): Promise<ArrayBuffer> {
  const hit = bytes.get(id);
  if (hit) { onProgress?.(hit.byteLength, hit.byteLength); return Promise.resolve(hit.slice(0)); }
  let p = inflight.get(id);
  if (p && !progress.has(id)) {
    // An in-flight download whose progress entry was swept by a cache clear
    // (StrictMode's mount/cleanup/mount does exactly this) — it is still
    // genuinely downloading, so say so again.
    progress.set(id, 0); notify();
  }
  if (!p) {
    progress.set(id, 0); notify();
    p = fetchPlanBytes(id, (b, t) => {
      progress.set(id, t ? Math.min(99, Math.round((b / t) * 100)) : 50);
      notify();
      onProgress?.(b, t);
    }).then(buf => {
      bytes.set(id, buf); progress.delete(id); inflight.delete(id); notify();
      return buf;
    }).catch(e => {
      // A failed download is simply not cached — the next open tries again.
      progress.delete(id); inflight.delete(id); notify();
      throw e;
    });
    inflight.set(id, p);
  }
  return p.then(buf => buf.slice(0));
}

/**
 * Download these in the background, ONE at a time — the sheet somebody is
 * actually reading must never be slowed by the ones they might read next.
 */
export function prefetchPlans(ids: string[]): void {
  // A file already on its way down keeps saying so — its progress entry can
  // have been swept by a cache clear while the download itself lives on.
  let changed = false;
  for (const id of ids) {
    if (inflight.has(id) && !bytes.has(id) && !progress.has(id)) { progress.set(id, 0); changed = true; }
  }
  if (changed) notify();
  queue = ids.filter(id => !bytes.has(id) && !inflight.has(id));
  void pump();
}

/**
 * The one pump draining the queue. It re-checks itself on the way out so a
 * queue replaced mid-flight is picked up — the first version kept a
 * running-flag that a StrictMode mount/cleanup/mount pair could strand at
 * "running" over an abandoned loop, and the chain silently never fetched
 * anything again. Clearing the cache empties the queue, which drains it.
 */
async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      if (bytes.has(id)) continue;
      try { await fetchPlanCached(id); } catch { /* stays undownloaded */ }
    }
  } finally {
    pumping = false;
    if (queue.length) void pump();
  }
}

/**
 * Reference-counted, because the drawer's plan pane and the full studio can
 * be open at once — the studio closing must not pull the pane's plans out
 * from under it.
 */
export function acquirePlanCache(): void { mounts++; }
export function releasePlanCache(): void {
  mounts = Math.max(0, mounts - 1);
  if (mounts === 0) {
    queue = []; bytes.clear(); progress.clear(); notify();
  }
}
