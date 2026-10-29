/**
 * Earlier versions of every pin board, kept on THIS computer.
 *
 * Why it exists (owner, 2026-10-29): the secretary's "waiting for gypsum" pin
 * board emptied itself and nothing could bring it back — the undo list lives
 * in the tab's memory and the board's pins live in one field of one record,
 * so one write from anywhere (another computer holding an old copy, an undo
 * of an older edit of the board) replaces the whole list and the old one is
 * gone everywhere.
 *
 * So every time a pin board's pins change on this computer, the list is kept
 * here too — the last few versions per board, newest first. The very first
 * render of a session draws the board from THIS computer's own saved copy,
 * before the cloud's answer lands, so a computer that still holds an older,
 * fuller board keeps that version the moment it opens, even after the cloud
 * replaces what it shows. The board's history button brings a version back.
 *
 * localStorage only and guarded: a full or blocked storage loses the history,
 * never the board.
 */
import type { PinItem } from '../components/board/PinBoardWidget';

const KEY = 'pin_board_versions';
/** How many versions per board are worth keeping. */
export const PIN_VERSIONS_MAX = 15;

export interface PinVersion {
  /** When this computer saw this version. */
  at: string;
  pins: PinItem[];
}

type Store = Record<string, PinVersion[]>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v as Store : {};
  } catch { return {}; }
}

function write(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full — the board itself is untouched */ }
}

/** A version's identity: what is on it, not where it sits. A pin moved is the same version. */
export function pinSig(pins: PinItem[]): string {
  return pins.map(p => p.jobId ? `j:${p.projectId ?? ''}:${p.jobId}` : `n:${p.id}:${p.text ?? ''}`).sort().join('|');
}

/**
 * Keep this list of pins as the board's newest version, unless it says the
 * same as the newest one already kept (then only that one's places update).
 * An empty board is never kept as a version — there is nothing in it to bring back.
 */
export function keepPinVersion(boardId: string, pins: PinItem[], now = new Date()): void {
  if (!pins.length) return;
  const s = read();
  const list = s[boardId] ?? [];
  const sig = pinSig(pins);
  if (list[0] && pinSig(list[0].pins) === sig) {
    list[0] = { at: list[0].at, pins };
  } else {
    list.unshift({ at: now.toISOString(), pins });
  }
  s[boardId] = list.slice(0, PIN_VERSIONS_MAX);
  write(s);
}

/** Every version kept for this board, newest first. */
export function pinVersions(boardId: string): PinVersion[] {
  return read()[boardId] ?? [];
}

/**
 * The pins of `version` that are NOT on the board now — what bringing it back
 * would add. A job already pinned (anywhere on this board) is never doubled,
 * and neither is a note that is still here.
 */
export function missingFrom(version: PinItem[], now: PinItem[]): PinItem[] {
  const jobs = new Set(now.filter(p => p.jobId).map(p => `${p.projectId ?? ''}:${p.jobId}`));
  const notes = new Set(now.filter(p => !p.jobId).map(p => p.id));
  return version.filter(p => p.jobId ? !jobs.has(`${p.projectId ?? ''}:${p.jobId}`) : !notes.has(p.id));
}
