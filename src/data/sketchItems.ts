/**
 * Placed blocks (B7): the model, and every rule about them that is arithmetic.
 *
 * A SKETCH ITEM is one block standing on one sheet. It lives in SHEET UNITS —
 * x across 0..1000, y down in the same units (so the sheet's height is
 * 1000·h/w) — which is the studio's own normalised convention scaled up, and
 * independent of any pixel size the plan happens to be drawn at. Its SIZE is
 * real centimetres (pick 19: a block is true size, locked); the sheet's scale
 * — metres across the whole width, `mPerW` — is what turns one into the other.
 *
 * Pure: no store, no DOM, no clock. The wall snap reads pixels it is HANDED.
 */
import type { CatalogBlock } from './catalog';

export interface SketchItem {
  id: string;
  /** The Drive file this sheet is — the record key everything else hangs on. */
  sheetId: string;
  jobId?: string;
  projectId?: string;
  /** Which page of a multi-page plan. */
  page: number;
  blockId: string;
  /** Copied from the catalog at placement, so a record outlives a rename and a PNG block that was deleted still draws its words. */
  name: string;
  model: string;
  brand: string;
  cat: string;
  /** The catalog's sub-kind (hidden-low, mini-central, wall …) — decides its outlets and its minimum drop. */
  sub?: string;
  unit: boolean;
  /** Which option of the floor it belongs to (pick 27); absent = the first. */
  option?: string;
  /** Centre, sheet units. */
  x: number;
  y: number;
  /** Degrees, clockwise on screen. */
  rot: number;
  /** Real size, cm — the catalog's until the padlock is opened (pick 19) or a grille is pulled (pick 51). */
  wCm: number;
  hCm: number;
  locked: boolean;
  /** The callout label (picks 44 · 49): offset from the block's centre in sheet units, its size, hidden, mirrored. */
  lx: number;
  ly: number;
  labelScale: number;
  labelHidden?: boolean;
  /** A unit's system letter (pick 45); its number is DERIVED from `seq` order within the system — never stored, so it can never go stale. */
  system?: string;
  seq: number;
  note?: string;
  createdAt: string;
  createdBy: string;
}

/** A sheet's own facts: the scale that turns cm into sheet units, and its systems (pick 45 · 48). */
export interface SketchSheet {
  id: string;
  /** Metres across the whole sheet width. */
  mPerW?: number;
  systems: string[];
  /** The floor's named options (picks 27 · 63–67); absent = one unnamed option. */
  options?: { id: string; name: string }[];
  /** How many times this sheet was exported — the vN of the next export (pick 70). */
  exportCount?: number;
  updatedAt: string;
}

/** One export (B9): what was made, where it went. Listed on the job page. */
export interface SketchExport {
  id: string;
  sheetId: string;
  jobId?: string;
  projectId?: string;
  version: number;
  /** The option names that became sheets. */
  options: string[];
  /** File names made, and where Drive put them (absent when only downloaded). */
  files: { name: string; fileId?: string; url?: string }[];
  createdAt: string;
  createdBy: string;
}

export const FIRST_OPTION = { id: 'o1', name: 'Option A' };
export const optionsOf = (sheet?: { options?: { id: string; name: string }[] } | null) => sheet?.options?.length ? sheet.options : [FIRST_OPTION];
/** Which option a record belongs to — a record from before options belongs to the first. */
export const optionOf = (rec: { option?: string }, options: { id: string }[]) => rec.option ?? options[0].id;

export const SU = 1000;
export const DEFAULT_SYSTEMS = ['A'];
/** With no scale known at all, a sheet is ASSUMED to be 20 m across — blocks come out plausible, and the shelf says so. */
export const ASSUMED_M_PER_W = 20;

/** Sheet units per real centimetre. */
export const suPerCm = (mPerW: number) => SU / (mPerW * 100);

/** From a clean base's record: mm per saved pixel × pixels across = metres across. */
export const mPerWFromPlan = (mmPerPx: number, widthPx: number) => (mmPerPx * widthPx) / 1000;

export interface Box { w: number; h: number }
export function itemBox(it: Pick<SketchItem, 'wCm' | 'hCm'>, mPerW: number): Box {
  const k = suPerCm(mPerW);
  return { w: it.wCm * k, h: it.hCm * k };
}

/** Snap an angle to the nearest step (pick 43: 15°), normalised to [0, 360). */
export function snapAngle(deg: number, step = 15): number {
  const s = Math.round(deg / step) * step;
  return ((s % 360) + 360) % 360;
}
export const normAngle = (deg: number) => ((deg % 360) + 360) % 360;

/** Rotate a vector by degrees (screen orientation: y down, positive is clockwise). */
export function rot2(x: number, y: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Is a sheet point inside this (rotated) block? */
export function hitItem(it: SketchItem, mPerW: number, px: number, py: number, pad = 0): boolean {
  const { w, h } = itemBox(it, mPerW);
  const l = rot2(px - it.x, py - it.y, -it.rot);
  return Math.abs(l.x) <= w / 2 + pad && Math.abs(l.y) <= h / 2 + pad;
}

/** Unit tags (pick 45): per system, in `seq` order — A1, A2 … B1 … Units only. */
export function unitTags(items: SketchItem[]): Map<string, string> {
  const out = new Map<string, string>();
  const bySys = new Map<string, SketchItem[]>();
  for (const it of items) {
    if (!it.unit) continue;
    const s = it.system || 'A';
    if (!bySys.has(s)) bySys.set(s, []);
    bySys.get(s)!.push(it);
  }
  for (const [s, list] of bySys) {
    list.sort((a, b) => a.seq - b.seq || a.createdAt.localeCompare(b.createdAt));
    list.forEach((it, i) => out.set(it.id, `${s}${i + 1}`));
  }
  return out;
}

/** The next free system letter after the ones in use: A, B, C … */
export function nextSystemLetter(systems: string[]): string {
  for (let i = 0; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!systems.includes(l)) return l; }
  return `S${systems.length + 1}`;
}

/** Where a fresh label sits: off the block's bottom-right corner (mirrored under `flip`). */
export function defaultLabelOffset(box: Box, flip = false): { lx: number; ly: number } {
  return { lx: (flip ? -1 : 1) * (box.w / 2 + 14), ly: box.h / 2 + 8 };
}

/**
 * The connection dots (pick 56, Sitting 11): ONE pipe dot on the block's
 * BACK edge, where the refrigerant pair, drain and feed leave; and OUTLET
 * dots on its FRONT edge for a flexible duct, sized by what the unit is — a
 * hidden unit's outlets are 20 cm, the mini-central's 30. A wall unit and an
 * outdoor unit have the pipe dot alone. Local coordinates, sheet units.
 */
export function connectionDots(box: Box, sub?: string, cat?: string): { x: number; y: number; kind: 'pipe' | 'outlet'; sizeCm: number }[] {
  const dots: { x: number; y: number; kind: 'pipe' | 'outlet'; sizeCm: number }[] = [{ x: -box.w * 0.3, y: -box.h / 2, kind: 'pipe', sizeCm: 0 }];
  if (cat === 'outdoor') return dots;
  const s = sub ?? '';
  const outletCm = /mini/.test(s) ? 30 : /hidden/.test(s) ? 20 : /vertical/.test(s) ? 30 : 0;
  if (outletCm) { dots.push({ x: -box.w * 0.25, y: box.h / 2, kind: 'outlet', sizeCm: outletCm }); dots.push({ x: box.w * 0.25, y: box.h / 2, kind: 'outlet', sizeCm: outletCm }); }
  return dots;
}

/** Counts per model on the sheet (pick 22 — the seed of the bill of quantities). */
export function countByModel(items: SketchItem[]): { key: string; name: string; model: string; brand: string; n: number }[] {
  const m = new Map<string, { key: string; name: string; model: string; brand: string; n: number }>();
  for (const it of items) {
    const key = `${it.brand}|${it.model || it.name}`;
    const row = m.get(key) ?? { key, name: it.name, model: it.model, brand: it.brand, n: 0 };
    row.n++; m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/* ── the wall snap (pick 42) ─────────────────────────────────────────── */

export interface WallSnap { x: number; y: number; rot: number }

/**
 * Letting go beside a wall snaps the block to it, turned to face the room;
 * letting go in the middle of a room changes nothing (`null`).
 *
 * All in the PIXELS of the image handed in: `cx, cy` the drop point, `reach`
 * how far a wall may be to count, `halfDepth` the block's half-height. Ink is
 * a dark pixel (luma < 120). The nearest ink pixel is the wall's face; the
 * wall's DIRECTION is the dominant axis of the ink around it (a PCA on the
 * dark pixels within `probe`); the side the hand let go on is the room, so
 * the block's BACK (its top edge, local −y) is turned to the wall and its
 * centre stands half a block off the face.
 */
export function wallSnap(img: ImageData, cx: number, cy: number, reach: number, halfDepth: number, probe = 10): WallSnap | null {
  const { width, height, data } = img;
  const dark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = (y * width + x) * 4;
    if (data[i + 3] < 40) return false;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 120;
  };
  // nearest ink to the drop point
  let best: { x: number; y: number; d: number } | null = null;
  const R = Math.ceil(reach);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = dx * dx + dy * dy;
    if (d > reach * reach || (best && d >= best.d)) continue;
    const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
    if (dark(x, y)) best = { x, y, d };
  }
  if (!best) return null;
  // dominant axis of the ink around the face
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const P = Math.ceil(probe);
  for (let dy = -P; dy <= P; dy++) for (let dx = -P; dx <= P; dx++) {
    if (dx * dx + dy * dy > probe * probe) continue;
    const x = best.x + dx, y = best.y + dy;
    if (!dark(x, y)) continue;
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  if (n < 4) return null;
  const mx = sx / n, my = sy / n;
  const vxx = sxx / n - mx * mx, vyy = syy / n - my * my, vxy = sxy / n - mx * my;
  // principal direction of the covariance
  const ang = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
  let dirX = Math.cos(ang), dirY = Math.sin(ang);
  const spread = Math.sqrt((vxx - vyy) ** 2 + 4 * vxy * vxy);
  if (spread < 1e-6) { dirX = 1; dirY = 0; }   // a blob — take it as horizontal
  // normal, signed toward the hand
  let nx = -dirY, ny = dirX;
  if ((cx - best.x) * nx + (cy - best.y) * ny < 0) { nx = -nx; ny = -ny; }
  const rot = normAngle((Math.atan2(-nx, ny) * 180) / Math.PI);
  return { x: best.x + nx * halfDepth, y: best.y + ny * halfDepth, rot: Math.round(rot) };
}

/** A fresh item from a catalog block at a sheet point. */
export function newItem(b: CatalogBlock, at: { x: number; y: number }, mPerW: number, ctx: { sheetId: string; page: number; jobId?: string; projectId?: string; system: string; seq: number; by: string; option?: string }): SketchItem {
  const box = itemBox(b, mPerW);
  const lab = defaultLabelOffset(box);
  return {
    id: `si-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    sheetId: ctx.sheetId, page: ctx.page, jobId: ctx.jobId, projectId: ctx.projectId, option: ctx.option,
    blockId: b.id, name: b.name, model: b.model, brand: b.brand, cat: b.cat, sub: b.sub || undefined, unit: b.unit,
    x: at.x, y: at.y, rot: 0, wCm: b.wCm, hCm: b.hCm, locked: true,
    lx: lab.lx, ly: lab.ly, labelScale: 1,
    system: b.unit ? ctx.system : undefined, seq: ctx.seq,
    createdAt: new Date().toISOString(), createdBy: ctx.by,
  };
}
