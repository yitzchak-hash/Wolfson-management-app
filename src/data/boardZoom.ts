/**
 * THE BOARD'S ZOOM UNIT (owner, 2026-10-08).
 *
 * "When it tells me 100% over here, I think the way 75 is now — that should be
 * the 100%." So the number the board SHOWS is relative to a new unit: what
 * used to read 75% now reads 100%. Everything the person reads or types — the
 * header readout, the typed % field, the 100% button, the default "opens at"
 * setting, the ladder's stops — speaks in these displayed numbers. Everything
 * the board COMPUTES with — the transform, culling, snapping thresholds, the
 * view memory (`board_view_<pid>_…`, which stores the real zoom) — stays in
 * real zoom, so nothing stored there changes meaning.
 *
 * `board_default_zoom_<pid>` holds a DISPLAYED fraction ("1.5" = 150%), the
 * number the person typed. A value written before this unit existed is read
 * the same way — the number they typed is the number they now see, and the
 * board opens a quarter smaller, which is exactly what was asked.
 *
 * Pure: no store, no DOM.
 */

/** The real zoom shown as "100%". */
export const ZOOM_UNIT = 0.75;

/** The ladder as people read it. */
export const SHOWN_ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3];

/** The same ladder in real zoom — what the board actually scales by. */
export const BOARD_ZOOM_STEPS = SHOWN_ZOOM_STEPS.map(d => Math.round(d * ZOOM_UNIT * 10000) / 10000);

/** The real zoom the board stands at when it reads 100%. */
export const HOME_ZOOM = ZOOM_UNIT;

/** A real zoom as the whole-number percentage the header prints. */
export function shownZoomPct(realZoom: number): number {
  return Math.round((realZoom / ZOOM_UNIT) * 100);
}

/** A typed percentage ("150") as a real zoom. */
export function realZoomFromPct(pct: number): number {
  return (pct / 100) * ZOOM_UNIT;
}

/** The nearest stop on a ladder of real zooms. */
export function nearestRung(rungs: number[], real: number): number {
  return rungs.reduce((best, z) => (Math.abs(z - real) < Math.abs(best - real) ? z : best), rungs[0]);
}

/**
 * What the per-machine default-zoom key means as a REAL zoom. The key holds
 * the displayed fraction (1 = 100%); absent or out of range → the board's
 * own 100%.
 */
export function defaultZoomFromStored(stored: string | null): number {
  const v = Number(stored);
  return stored !== null && Number.isFinite(v) && v >= 0.25 && v <= 3 ? v * ZOOM_UNIT : HOME_ZOOM;
}

/** The displayed fraction to store for a real zoom ("use now"). */
export function storedFromRealZoom(realZoom: number): string {
  return String(Math.round((realZoom / ZOOM_UNIT) * 1000) / 1000);
}
