import { useSyncExternalStore } from 'react';

/**
 * EVERY UPLOAD, SEEN (owner, 2026-11-08: "when we upload a picture … the second we press OK … we don't see like
 * uploading with the progress. We just have to wait 10 seconds and nothing happens, and then boom, it just shows").
 *
 * The two Drive upload doors in driveApi announce each file on the window ('tz-upload'); this keeps the list of what
 * is going up right now, for the message box's own "Uploading…" and the office's corner card (UploadToasts). Kept in
 * memory only — an upload belongs to this page, not to the cloud.
 */
export interface UploadRow { id: number; name: string; pct: number; startedAt: number; size: number }

let rows: UploadRow[] = [];
const subs = new Set<() => void>();
const emit = () => { rows = [...rows]; batchSnap = batchView(); subs.forEach(f => f()); };

if (typeof window !== 'undefined') {
  window.addEventListener('tz-upload', e => {
    const d = (e as CustomEvent<{ id: number; name: string; pct: number; size?: number; done?: boolean }>).detail;
    if (!d) return;
    if (d.done) {
      const was = rows.find(r => r.id === d.id);
      rows = rows.filter(r => r.id !== d.id);
      if (was && batch) { batch.doneCount += 1; batch.doneBytes += was.size; }
      settle(); emit(); return;
    }
    const r = rows.find(x => x.id === d.id);
    if (!r) {
      const size = Math.max(1, d.size ?? 1);
      rows.push({ id: d.id, name: d.name, pct: d.pct, startedAt: Date.now(), size });
      // a file the page announced up front is already counted; any other joins the batch now
      if (!batch) batch = { count: 0, bytes: 0, doneCount: 0, doneBytes: 0, expected: 0, expectedBytes: 0 };
      if (batch.expected > 0) { batch.expected -= 1; batch.expectedBytes = Math.max(0, batch.expectedBytes - size); }
      else { batch.count += 1; batch.bytes += size; }
      emit(); return;
    }
    if (d.pct > r.pct) { r.pct = Math.min(100, d.pct); emit(); }
  });
}

/**
 * ONE BAR FOR EVERYTHING GOING UP (owner, 2026-11-09: "Instead of showing uploading one by one … make the bar of
 * progress show the total number"). Files go up one after another; a page that knows how many it is about to send
 * says so first (expectUploads), so the bar counts "2 of 5" and measures the TOTAL bytes from the start. A batch
 * ends when every file has landed and nothing is going up; one that is promised but never arrives lets go after 20 s.
 */
interface Batch { count: number; bytes: number; doneCount: number; doneBytes: number; expected: number; expectedBytes: number }
let batch: Batch | null = null;
let batchSnap: BatchView | null = null;
let idleTimer = 0;
export interface BatchView { count: number; done: number; pct: number; current: string }
function settle() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(idleTimer);
  if (!batch) return;
  if (!rows.length && batch.doneCount >= batch.count && batch.expected <= 0) { batch = null; return; }
  if (!rows.length) idleTimer = window.setTimeout(() => { if (!rows.length) { batch = null; emit(); } }, 20000);
}
/** A page about to send these files: count them now, so the bar shows the whole batch. */
export function expectUploads(files: { size: number }[]) {
  if (!files.length) return;
  if (!batch) batch = { count: 0, bytes: 0, doneCount: 0, doneBytes: 0, expected: 0, expectedBytes: 0 };
  for (const f of files) { batch.count += 1; batch.bytes += Math.max(1, f.size); batch.expected += 1; batch.expectedBytes += Math.max(1, f.size); }
  emit();
}
/** Promised files that will not be sent after all (an error before they started). */
export function forgetExpected() {
  if (!batch) return;
  batch.count -= batch.expected; batch.bytes -= batch.expectedBytes; batch.expected = 0; batch.expectedBytes = 0;
  settle(); emit();
}
const batchView = (): BatchView | null => {
  if (!batch || batch.count <= 0) return null;
  const going = rows.reduce((t, r) => t + r.size * r.pct / 100, 0);
  const pct = Math.max(0, Math.min(100, Math.round(100 * (batch.doneBytes + going) / Math.max(1, batch.bytes))));
  return { count: batch.count, done: batch.doneCount, pct, current: rows[rows.length - 1]?.name ?? '' };
};
/** The batch going up now (null when nothing is), for the one progress bar. */
export function useUploadBatch(): BatchView | null {
  return useSyncExternalStore(subscribe, () => batchSnap, () => batchSnap);
}

/** How many message boxes are showing their own "Uploading…" right now — the corner card stays out of their way. */
let boxes = 0;
export function boxShowing(delta: 1 | -1) { boxes = Math.max(0, boxes + delta); emit(); }
const boxSnap = () => boxes;
export function useBoxShowing(): number { return useSyncExternalStore(subscribe, boxSnap, boxSnap); }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snapshot = () => rows;
/** The uploads going up right now, newest last. */
export function useUploads(): UploadRow[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
