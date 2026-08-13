/**
 * The screen shapes a wall dashboard can be laid out for.
 *
 * One arrangement cannot serve every panel. A row of four cards that reads
 * perfectly across a 16:9 television is four narrow columns on a 9:16 one
 * turned on its side, and the office lays the wall out from a PC — a window
 * that is neither shape. So the editor asks which screen you are arranging,
 * and each shape keeps its own sizes.
 *
 * Deliberately a SHORT list of real screens rather than a free width and
 * height. Nobody wants to think in pixels about a television, and an
 * arrangement per arbitrary size would be an arrangement nobody ever finishes.
 */

export interface DashRatio {
  key: string;
  label: string;
  /** A representative size, used to shape the preview and to match a screen. */
  w: number;
  h: number;
  orientation: 'landscape' | 'portrait';
  hint: string;
}

export const DASH_RATIOS: DashRatio[] = [
  { key: '16-9', label: '16:9', w: 1920, h: 1080, orientation: 'landscape',
    hint: 'Almost every television and office panel.' },
  { key: '16-10', label: '16:10', w: 1920, h: 1200, orientation: 'landscape',
    hint: 'A computer monitor used as a wall screen.' },
  { key: '4-3', label: '4:3', w: 1440, h: 1080, orientation: 'landscape',
    hint: 'An older projector or panel.' },
  { key: '21-9', label: '21:9', w: 2560, h: 1080, orientation: 'landscape',
    hint: 'An ultrawide strip above a desk.' },
  { key: '9-16', label: '9:16', w: 1080, h: 1920, orientation: 'portrait',
    hint: 'A panel turned on its side — the Flip on its mount.' },
  { key: '3-4', label: '3:4', w: 1080, h: 1440, orientation: 'portrait',
    hint: 'A squarer portrait screen.' },
];

export const DEFAULT_DASH_RATIO = '16-9';

export const dashRatio = (key: string | undefined): DashRatio =>
  DASH_RATIOS.find(r => r.key === key) ?? DASH_RATIOS[0];

/**
 * The shape on this list that a real screen is closest to.
 *
 * Compared as a log of the aspect, so 21:9 is as far from 16:9 as 16:9 is from
 * something correspondingly narrower — a plain difference of ratios makes
 * every wide screen look equally close to every other one.
 */
export function nearestRatio(width: number, height: number): DashRatio {
  const a = Math.log(Math.max(1, width) / Math.max(1, height));
  let best = DASH_RATIOS[0];
  let bestGap = Infinity;
  for (const r of DASH_RATIOS) {
    const gap = Math.abs(Math.log(r.w / r.h) - a);
    if (gap < bestGap) { bestGap = gap; best = r; }
  }
  return best;
}

/**
 * A widget's size ON one shape.
 *
 * The element's own `w`/`h`/`z` stay the fallback, so every arrangement that
 * existed before this carries on being the one every shape starts from, and a
 * shape nobody has arranged yet inherits rather than opening empty.
 */
export interface DashPlace { w: number; h: number; z: number }

export function placeOn(
  el: { w: number; h: number; z?: number; byRatio?: Record<string, DashPlace> },
  ratioKey: string,
): DashPlace {
  const own = el.byRatio?.[ratioKey];
  return {
    w: own?.w ?? el.w,
    h: own?.h ?? el.h,
    z: own?.z ?? el.z ?? 0,
  };
}

/**
 * Write a size for one shape, leaving every other shape alone.
 *
 * The base `w`/`h`/`z` are updated too, but ONLY for the shape the wall is
 * most likely to be — otherwise a quick tidy-up on a portrait screen silently
 * becomes the starting point for every landscape one.
 */
export function patchPlace(
  el: { w: number; h: number; z?: number; byRatio?: Record<string, DashPlace> },
  ratioKey: string,
  patch: Partial<DashPlace>,
): { byRatio: Record<string, DashPlace> } & Partial<{ w: number; h: number; z: number }> {
  const now = placeOn(el, ratioKey);
  const next = { ...now, ...patch };
  const byRatio = { ...(el.byRatio ?? {}), [ratioKey]: next };
  return ratioKey === DEFAULT_DASH_RATIO
    ? { byRatio, w: next.w, h: next.h, z: next.z }
    : { byRatio };
}
