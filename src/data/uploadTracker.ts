import { useSyncExternalStore } from 'react';

/**
 * EVERY UPLOAD, SEEN (owner, 2026-11-08: "when we upload a picture … the second we press OK … we don't see like
 * uploading with the progress. We just have to wait 10 seconds and nothing happens, and then boom, it just shows").
 *
 * The two Drive upload doors in driveApi announce each file on the window ('tz-upload'); this keeps the list of what
 * is going up right now, for the message box's own "Uploading…" and the office's corner card (UploadToasts). Kept in
 * memory only — an upload belongs to this page, not to the cloud.
 */
export interface UploadRow { id: number; name: string; pct: number; startedAt: number }

let rows: UploadRow[] = [];
const subs = new Set<() => void>();
const emit = () => { rows = [...rows]; subs.forEach(f => f()); };

if (typeof window !== 'undefined') {
  window.addEventListener('tz-upload', e => {
    const d = (e as CustomEvent<{ id: number; name: string; pct: number; done?: boolean }>).detail;
    if (!d) return;
    if (d.done) { rows = rows.filter(r => r.id !== d.id); emit(); return; }
    const r = rows.find(x => x.id === d.id);
    if (!r) { rows.push({ id: d.id, name: d.name, pct: d.pct, startedAt: Date.now() }); emit(); return; }
    if (d.pct > r.pct) { r.pct = Math.min(100, d.pct); emit(); }
  });
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
