import { useEffect, useState } from 'react';

/**
 * The markup studio's TABLET choices, kept on THIS tablet only (owner,
 * 2026-11-09: "build it" on "The Studio on the Tablet", answers 2 and 5).
 *
 * Which hand holds the pen, and whether a finger may still draw once an
 * S Pen has been seen, are facts about the person at THIS screen — the same
 * kind of fact as `markup_ui_scale` — so they live in localStorage, never in
 * the synced store: a left-handed tablet must not move every PC's rail.
 * Each key is listed in deviceOnly.ts with its reason.
 */
const HAND = 'studio_drawing_hand';
const FINGER = 'studio_finger_draws';
const PEN_SEEN = 'studio_pen_seen';
const EVENT = 'studio-tablet-prefs';

export type DrawingHand = 'right' | 'left';

// Every storage call names its key plainly, so the build's backup-coverage
// check can see each one is listed in deviceOnly.ts.
const changed = () => window.dispatchEvent(new Event(EVENT));

/** Right-handed is the default: the rail then sits on the LEFT, out from under the hand. */
export function getDrawingHand(): DrawingHand {
  try { return localStorage.getItem(HAND) === 'left' ? 'left' : 'right'; } catch { return 'right'; }
}
export function setDrawingHand(h: DrawingHand): void {
  try { localStorage.setItem(HAND, h); } catch { /* private mode — the choice does not stick */ }
  changed();
}

/** Off by default: once a pen has been seen, a finger pans and pinches and never draws. */
export function getFingerDraws(): boolean {
  try { return localStorage.getItem(FINGER) === '1'; } catch { return false; }
}
export function setFingerDraws(on: boolean): void {
  try { if (on) localStorage.setItem(FINGER, '1'); else localStorage.removeItem(FINGER); } catch { /* private mode */ }
  changed();
}

/** Has an S Pen / Apple Pencil ever touched the studio on this tablet? */
export function getPenSeen(): boolean {
  try { return localStorage.getItem(PEN_SEEN) === '1'; } catch { return false; }
}
export function notePenSeen(): void {
  if (getPenSeen()) return;
  try { localStorage.setItem(PEN_SEEN, '1'); } catch { /* private mode */ }
  changed();
}

export interface TabletStudioPrefs { hand: DrawingHand; fingerDraws: boolean; penSeen: boolean }

function snapshot(): TabletStudioPrefs {
  return { hand: getDrawingHand(), fingerDraws: getFingerDraws(), penSeen: getPenSeen() };
}

/** The three, following the settings page and other tabs live. */
export function useTabletStudioPrefs(): TabletStudioPrefs {
  const [v, setV] = useState(snapshot);
  useEffect(() => {
    const on = () => setV(snapshot());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return v;
}
