/**
 * The punch list files itself in Drive — quietly, from the preview.
 *
 * Pins are DATA first: the moment one is placed it is in the app's own synced
 * records and on every device, so nothing here is about not losing pins. This
 * is about the PAPER TRAIL: a minute after the last pin change on a plan, the
 * pins are stamped into a PDF and filed in Drive under
 * "Annotated Plans/Pins" — ONE file per apartment, brought up to date on
 * every filing (the anti-spam rule; Drive keeps its own revision history of
 * the file), named "punch list". No buttons, no questions — the owner's ask.
 *
 * Module-level on purpose:
 *  - the timer survives the overlay unmounting (closing the drawer must not
 *    swallow a filing that was already owed);
 *  - two mounted overlays for the same apartment share one timer and cannot
 *    double-file.
 *
 * The file's identity is remembered on the APARTMENT (`pinsDriveFileId`,
 * canvas-only so it never bumps "last edited"), so tomorrow's filing from a
 * different machine still updates the same file. A vanished file falls back
 * to create on the server side.
 */
import { PlanPin, User } from '../types';
import { stampPlanToDrive, isUploadBackendConfigured } from './driveApi';
import { pinStamp } from './planExport';
import { cachedPlanAspect, measurePlanAspect } from './planAspect';
import { useStore } from './store';

/** A minute of quiet before filing — overridable so a harness need not wait. */
function idleMs(): number {
  try {
    const n = Number(localStorage.getItem('pin_push_idle_ms'));
    if (Number.isFinite(n) && n >= 500) return n;
  } catch { /* storage can throw in odd contexts */ }
  return 60_000;
}

interface PushCtx {
  apartmentId: string;
  planFileId: string;
  parentFolderId: string;
  jobName: string;
  author: string;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** What Drive already holds, per apartment — a filing with nothing new is skipped. */
const filedSig = new Map<string, string>();
/** The sig seen at first sight, so LOADING existing pins never files anything. */
const baseline = new Map<string, string>();
const inFlight = new Set<string>();
/** Listeners for the tiny "filed" flash, keyed by apartment. */
const listeners = new Map<string, Set<() => void>>();

/** Only what the stamped PDF actually shows: place, order, open/done. */
function sigOf(pins: PlanPin[]): string {
  return pins.map(p =>
    `${p.id}:${p.xPct.toFixed(1)},${p.yPct.toFixed(1)}${p.resolvedAt ? 'r' : ''}`).join('|');
}

export function onPinsFiled(apartmentId: string, cb: () => void): () => void {
  const set = listeners.get(apartmentId) ?? new Set();
  set.add(cb);
  listeners.set(apartmentId, set);
  return () => { set.delete(cb); };
}

/**
 * Call on every render of a pin surface with the CURRENT pins. Cheap: a
 * string compare, and a timer only when something really changed.
 */
export function notePins(ctx: PushCtx, pins: PlanPin[]): void {
  if (!isUploadBackendConfigured() || !ctx.planFileId || !ctx.parentFolderId) return;
  const key = ctx.apartmentId;
  const sig = sigOf(pins);
  if (!baseline.has(key)) {
    // First sight of this apartment's pins this session: whatever is already
    // there is not news — only a CHANGE from here on arms the clock.
    baseline.set(key, sig);
    return;
  }
  if (sig === baseline.get(key) || sig === filedSig.get(key)) return;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { void file(ctx, key); }, idleMs()));
}

/**
 * File right now — the studio's "Save with pins and no ink" comes through
 * here too, so there is exactly ONE implementation of "the punch list goes
 * to Drive" and the two paths cannot drift apart.
 */
export function filePinsNow(ctx: PushCtx): Promise<'filed' | 'current' | 'empty' | 'failed'> {
  clearTimeout(timers.get(ctx.apartmentId));
  return file(ctx, ctx.apartmentId);
}

async function file(ctx: PushCtx, key: string): Promise<'filed' | 'current' | 'empty' | 'failed'> {
  if (inFlight.has(key)) return 'current';
  // Read the pins FRESH from the store — the ones captured when the timer was
  // armed may be a minute stale, and a pin resolved in between must file as
  // resolved.
  const st = useStore.getState();
  const pins = st.planPins.filter(p => p.apartmentId === ctx.apartmentId);
  const sig = sigOf(pins);
  if (sig === filedSig.get(key)) return 'current';
  if (!pins.length) {
    // Every pin deleted: nothing to draw. The last filed PDF stays as the
    // record; deleting files is never this module's business.
    filedSig.set(key, sig);
    return 'empty';
  }
  inFlight.add(key);
  try {
    const aspect = cachedPlanAspect(ctx.planFileId)
      ?? await measurePlanAspect(ctx.planFileId).catch(() => null)
      ?? Math.SQRT2;
    const apt = useStore.getState().apartments.find(a => a.id === ctx.apartmentId);
    const out = await stampPlanToDrive({
      planFileId: ctx.planFileId,
      parentFolderId: ctx.parentFolderId,
      strokes: pinStamp(pins, aspect).map(({ id: _id, ...rest }) => rest),
      version: 1,
      nameTag: 'punch list',
      folderName: 'Annotated Plans/Pins',
      jobName: ctx.jobName,
      author: ctx.author,
      updateFileId: apt?.pinsDriveFileId ?? null,
    });
    filedSig.set(key, sig);
    baseline.set(key, sig);
    if (out.fileId && out.fileId !== apt?.pinsDriveFileId) {
      // A canvas-only field, so this write never bumps "last edited". The
      // portal has no signed-in user; the pin author stands in.
      const user = useStore.getState().currentUser
        ?? ({ id: 'pin-filer', name: ctx.author || 'Punch list' } as User);
      useStore.getState().updateApartment(ctx.apartmentId, { pinsDriveFileId: out.fileId }, user);
    }
    listeners.get(key)?.forEach(cb => cb());
    return 'filed';
  } catch {
    // Drive said no — leave the signatures alone so the next pin change (or
    // the next visit) tries again. Failing quietly is right here: this is a
    // background courtesy, and the pins themselves are already safe.
    return 'failed';
  } finally {
    inFlight.delete(key);
  }
}
