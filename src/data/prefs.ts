/**
 * PERSONAL AND OFFICE CHOICES, IN THE CLOUD (owner, 2026-10-29: "I want
 * nothing to live on the computer, absolutely nothing … even if we open up
 * new computers").
 *
 * Every small choice the app used to keep in one browser — a board's zoom
 * and place, which board is showing, sort orders, folded panels, the plan
 * studio's tabs, recent searches, saved markup colours — lives here instead:
 *
 *  - PERSON: `userPrefs/u:<user id>` (office) or `userPrefs/c:<worker id>`
 *    (the worker's phone). Follows the person to any computer.
 *  - OFFICE: `userPrefs/office` — choices the whole office shares (the
 *    markup colours the office decided on).
 *
 * The calls mirror localStorage's (`prefGet`, `prefSet`, `prefRemove`, plain
 * strings), so the callers did not change shape. Reads are instant: the last
 * cloud copy is mirrored on the computer (`prefs_mirror`, a cache only). A
 * value this computer still has from before the move is adopted into the
 * cloud the first time it is read, then removed from the browser.
 *
 * Writes go up a moment later (debounced), only the keys that changed
 * (fsPatch), so a board being panned costs one write when it settles.
 */
import { fsPatch, fsListenDoc, isFirebaseConfigured } from './firebase';

type Scope = 'person' | 'office';
type Bag = Record<string, string>;
const MIRROR = 'prefs_mirror';
const COLL = 'userPrefs';

let personId: string | null = null;
const bags: Record<string, Bag> = {};          // doc id → values as this computer has them
const cloud: Record<string, Bag | null> = {};  // doc id → the cloud's last answer (null = no doc yet)
const unsubs: Record<string, () => void> = {};
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
const listeners = new Set<() => void>();

function readMirror(): Record<string, Bag> {
  try { return JSON.parse(localStorage.getItem(MIRROR) || '{}') as Record<string, Bag>; } catch { return {}; }
}
function writeMirror() {
  try { localStorage.setItem(MIRROR, JSON.stringify(bags)); } catch { /* private mode: the cloud still has it */ }
}
(() => { const m = readMirror(); for (const k of Object.keys(m)) bags[k] = m[k]; })();

const docOf = (scope: Scope): string | null => (scope === 'office' ? 'office' : personId);

function attach(id: string) {
  if (unsubs[id] || !isFirebaseConfigured) return;
  unsubs[id] = fsListenDoc(COLL, id, data => {
    const theirs = ((data?.prefs ?? {}) as Bag);
    cloud[id] = data ? { ...theirs } : null;
    // The cloud wins for every key it has; keys only here are still on their way up.
    bags[id] = { ...(bags[id] ?? {}), ...theirs };
    writeMirror();
    listeners.forEach(fn => fn());
  });
}

/** Who is signed in on this computer, as prefs/undo key them (`u:<id>`, `c:<id>`), or null. */
export const prefsPerson = (): string | null => personId;

/** Who this computer is now: an office user (`u:<id>`) or a worker (`c:<id>`). */
export function setPrefsPerson(id: string | null) {
  if (id === personId) return;
  personId = id;
  if (id) { bags[id] ??= {}; attach(id); }
  attach('office');
}

function scheduleUpload(id: string) {
  if (!isFirebaseConfigured) return;
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => {
    // Not heard from the cloud yet: wait — writing now could replace choices
    // this computer has not seen (a new computer, first minute).
    if (!(id in cloud)) { scheduleUpload(id); return; }
    const before = cloud[id];
    const after = { id, prefs: { ...(bags[id] ?? {}) } };
    // No document yet → written whole; otherwise only the keys that changed.
    fsPatch(COLL, id, before ? { id, prefs: before } : null, after);
    cloud[id] = { ...after.prefs };
  }, 1500);
}

/** Like localStorage.getItem — but the value lives in the cloud. */
export function prefGet(key: string, scope: Scope = 'person'): string | null {
  const id = docOf(scope);
  if (id && bags[id] && key in bags[id]) return bags[id][key];
  // From before the move: adopt it into the cloud, then let the browser forget it.
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(key); } catch { /* blocked */ }
  if (legacy !== null && id) {
    prefSet(key, legacy, scope);
    try { localStorage.removeItem(key); } catch { /* blocked */ }
  }
  return legacy;
}

/** Like localStorage.setItem — kept in the cloud (this computer mirrors it). */
export function prefSet(key: string, value: string, scope: Scope = 'person') {
  const id = docOf(scope);
  if (!id) { try { localStorage.setItem(key, value); } catch { /* blocked */ } return; }   // nobody signed in yet
  bags[id] = { ...(bags[id] ?? {}), [key]: value };
  writeMirror();
  scheduleUpload(id);
}

/** Like localStorage.removeItem. */
export function prefRemove(key: string, scope: Scope = 'person') {
  const id = docOf(scope);
  try { localStorage.removeItem(key); } catch { /* blocked */ }
  if (!id || !bags[id] || !(key in bags[id])) return;
  const next = { ...bags[id] }; delete next[key]; bags[id] = next;
  writeMirror();
  scheduleUpload(id);
}

/** Told when the cloud's copy arrives or changes (a screen can re-read). */
export function onPrefsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
