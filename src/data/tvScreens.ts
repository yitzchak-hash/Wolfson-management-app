import { fsSet, fsGetAll, fsDelete, isFirebaseConfigured } from './firebase';

/**
 * Live feedback from the wall panels — the owner's "get back the live feed
 * from the TV", made practical.
 *
 * Every /tv page mints itself a PERMANENT id (localStorage, this panel only)
 * and reports its real geometry to one small global Firestore collection
 * while it is open: what it is drawing at, the device ratio, the shape that
 * falls out of those, and the smallest text actually on its screen in real
 * pixels. App settings reads the collection and shows each panel as a live
 * card — so the office aims and sizes each TV against what that TV really
 * is, instead of guessing an aspect ratio from across the building.
 *
 * A pixel screenshot is deliberately NOT attempted: a browser cannot cheaply
 * photograph its own DOM, and the numbers plus the settings page's own
 * miniature of the chosen region ARE the picture that matters — the shape,
 * the slice, and whether the words are readable.
 *
 * Per-screen SETTINGS (name, region, display size) live in the __tv bag
 * (`tvScreens` on BoardSetting), so they inherit persist/sync/export with no
 * new state key. This module is only the PRESENCE side.
 */

export interface TvScreenPresence {
  id: string;
  /** CSS viewport being drawn at. */
  w: number;
  h: number;
  dpr: number;
  /** Real device pixels — what the panel actually has. */
  realW: number;
  realH: number;
  /** Which workspace the panel is showing. */
  view: string;
  /** The display scale in effect when it reported. */
  scale: number;
  /** Smallest text on screen, in REAL pixels — the readability truth. */
  smallest: number | null;
  lastSeen: string;
}

const ID_KEY = 'tv_screen_id';

/** This panel's own permanent identity. Minted once, kept in localStorage. */
export function tvScreenId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = `TVS-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return 'TVS-unknown';
  }
}

/**
 * The smallest text drawn on screen, in real pixels.
 *
 * The ScreenReport's own measurement, extracted: `rect.height/offsetHeight`
 * folds in every `zoom` between the element and the viewport, times the
 * device ratio — the honest answer for somebody across the room.
 */
export function measureSmallestText(skip?: HTMLElement | null): number | null {
  const dpr = window.devicePixelRatio || 1;
  let smallest = Infinity, n = 0;
  for (const el of document.querySelectorAll<HTMLElement>('div,span,p,b,strong,h1,h2,h3')) {
    if (el.children.length || !el.offsetHeight) continue;
    if (skip?.contains(el)) continue;
    if (!el.textContent?.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    const px = parseFloat(getComputedStyle(el).fontSize) * (r.height / el.offsetHeight) * dpr;
    if (px > 0) { smallest = Math.min(smallest, px); n++; }
  }
  return n ? Math.round(smallest) : null;
}

/** One heartbeat: this panel, as it is right now. Fire-and-forget. */
export function reportTvScreen(view: string, scale: number): void {
  if (!isFirebaseConfigured) return;
  const dpr = window.devicePixelRatio || 1;
  const p: TvScreenPresence = {
    id: tvScreenId(),
    w: window.innerWidth, h: window.innerHeight, dpr,
    realW: Math.round(window.innerWidth * dpr),
    realH: Math.round(window.innerHeight * dpr),
    view, scale,
    smallest: measureSmallestText(),
    lastSeen: new Date().toISOString(),
  };
  fsSet('tvScreens', p.id, p as unknown as Record<string, unknown>);
}

/** Every panel that has reported, newest first. */
export async function loadTvScreens(): Promise<TvScreenPresence[]> {
  if (!isFirebaseConfigured) return [];
  const rows = (await fsGetAll('tvScreens')) as unknown as TvScreenPresence[];
  return rows
    .filter(r => r && r.id && r.w > 0 && r.h > 0)
    .sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));
}

/** Forget a panel that no longer exists. */
export function forgetTvScreen(id: string): void {
  fsDelete('tvScreens', id);
}

/** "Showing now" vs "last seen": a heartbeat lands every 45s while open. */
export function screenIsLive(p: TvScreenPresence, now = Date.now()): boolean {
  const t = Date.parse(p.lastSeen ?? '');
  return Number.isFinite(t) && now - t < 120_000;
}

/** 1920×1080 → "16:9" (nearest sensible name), for showing beside the numbers. */
export function shapeNameOf(w: number, h: number): string {
  if (!w || !h) return '';
  const r = w / h;
  const known: [string, number][] = [
    ['16:9', 16 / 9], ['16:10', 16 / 10], ['4:3', 4 / 3], ['21:9', 21 / 9],
    ['9:16', 9 / 16], ['10:16', 10 / 16], ['3:4', 3 / 4],
  ];
  let best = known[0];
  for (const k of known) if (Math.abs(k[1] - r) < Math.abs(best[1] - r)) best = k;
  return Math.abs(best[1] - r) / r < 0.05 ? best[0] : r.toFixed(2);
}
