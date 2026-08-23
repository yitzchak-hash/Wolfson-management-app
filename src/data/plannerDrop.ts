/**
 * Putting a job into a notebook square, from wherever it was dragged.
 *
 * The board's tiles could do this and nothing else could — so a job listed in
 * "New this week" or "Running late", which is exactly where you notice it needs
 * a day, had to be found on the board first before it could be planned. This is
 * the same write the board does, lifted out so every list can reach it and the
 * two can never drift into disagreeing about what a drop means.
 *
 * It reaches the store directly rather than taking a context: the widgets that
 * need it draw a `MiniJob` deep inside a memoised tree, and threading a writer
 * down through `WidgetCtx` is what left `update` stubbed to a no-op for a year.
 */
import React, { useRef, useState } from 'react';
import { useStore } from './store';
import { RotaHit, setRotaHover, rotaCellAt, anyRota, anyBoardDrop, boardDropAt } from './rotaDrop';
import type { PlannerEntry } from '../components/board/PlannerWidget';

export interface DropResult {
  /** How many squares were actually written. */
  added: number;
  /** Of those, how many were an extra day for a job already in the notebook. */
  ghosted: number;
}

/**
 * Add jobs to the square a `RotaHit` names.
 *
 * A repeat in the SAME square is dropped — it says nothing the first one did
 * not — but a job already elsewhere in the notebook is welcome: that is one
 * job wearing two faces, exactly like a ghost on the board, and it stays one
 * job in every total. The job is marked `inNotebook` rather than binned,
 * because a binned job falls out of `isCountableApartment` and every count in
 * the app would drop each time somebody planned some work.
 */
export function placeJobsOnPlanner(
  cell: RotaHit,
  ids: string[],
  /**
   * The workspace those ids belong to. Omit for the one you are in.
   *
   * A foreign job STAYS PUT: it is not marked `inNotebook`, nothing leaves its
   * building diagram, and no count there changes. The square holds a pointer,
   * which is what lets the office plan Wolfson work on the same week as the
   * Job Board's without moving anything.
   */
  projectId?: string,
): DropResult {
  setRotaHover(null);
  const st = useStore.getState();
  const el = st.canvasElements.find(c => c.id === cell.elId);
  if (!el) return { added: 0, ghosted: 0 };
  const foreign = !!projectId && projectId !== st.currentProjectId;

  const wasInNotebook = foreign ? new Set<string>() : new Set(
    ids.filter(id => st.apartments.find(a => a.id === id)?.inNotebook));

  const data = (el.data ?? {}) as Record<string, unknown>;
  const cells = { ...((data.cells ?? {}) as Record<string, PlannerEntry[]>) };
  const key = `${cell.person}|${cell.day}`;
  const already = cells[key] ?? [];

  const fresh = ids
    .filter(id => !already.some(e => e.jobId === id))
    .map(id => ({
      id: `R-${Math.random().toString(36).slice(2, 8)}`,
      jobId: id,
      ...(foreign ? { projectId } : {}),
    }));
  if (!fresh.length) return { added: 0, ghosted: 0 };

  cells[key] = [...already, ...fresh];
  st.updateCanvasElement(el.id, { data: { ...data, cells } });

  // Only a job in THIS workspace moves in. A foreign one is pointed at, never
  // moved — writing `inNotebook` on it would mean reaching into another
  // workspace's records to take a unit off its own diagram.
  const user = st.currentUser;
  if (user && !foreign) {
    for (const { jobId } of fresh) {
      const j = st.apartments.find(a => a.id === jobId);
      if (j && j.inNotebook !== el.id) st.updateApartment(jobId, { inNotebook: el.id }, user);
    }
  }

  return {
    added: fresh.length,
    ghosted: fresh.filter(f => wasInNotebook.has(f.jobId)).length,
  };
}

/** The sentence to show after a drop — one place, so every list says the same. */
export function dropMessage(r: DropResult): string | null {
  if (!r.added) return null;
  if (r.ghosted) {
    return r.added === 1 ? 'Another day for the same job' : `${r.added} more days`;
  }
  return r.added === 1 ? 'Moved into the notebook' : `${r.added} jobs moved into the notebook`;
}

/**
 * Make anything that stands for a job draggable onto a notebook square.
 *
 * One hook, so a list row and a diagram cell cannot end up with two slightly
 * different versions of the same gesture. Four pixels of travel separates a
 * drag from a press, which is what lets a row keep its click: below that this
 * never fires and the button behaves exactly as it did.
 *
 * A job from ANOTHER workspace is welcome: pass `projectId` and the entry
 * remembers where it came from, so the card can resolve it and say which
 * workspace it is in. It stays put over there — see `placeJobsOnPlanner`.
 */
export function usePlannerDrag(jobId: string, opts?: {
  enabled?: boolean;
  onToast?: (msg: string) => void;
  /** Which workspace this job lives in. Omit for the one you are in. */
  projectId?: string;
}) {
  const enabled = opts?.enabled !== false;
  const drag = useRef<{ x: number; y: number; live: boolean } | null>(null);
  const [held, setHeld] = useState(false);
  /**
   * A drag just finished, so the click that follows it is not a click.
   *
   * The row captures the pointer, so releasing over a notebook square still
   * dispatches a `click` back on the row — which opened the job's drawer every
   * time somebody planned one. Swallowed in the CAPTURE phase, which is the
   * only way to stop the element's own `onClick`: React stops dispatching the
   * rest of the path the moment propagation is stopped.
   */
  const justDragged = useRef(false);

  const handlers = {
    onClickCapture: (e: React.MouseEvent) => {
      if (!justDragged.current) return;
      justDragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (!enabled || e.button !== 0 || (!anyRota() && !anyBoardDrop())) return;
      drag.current = { x: e.clientX, y: e.clientY, live: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.live && Math.abs(e.clientX - d.x) < 4 && Math.abs(e.clientY - d.y) < 4) return;
      if (!d.live) { d.live = true; setHeld(true); }
      setRotaHover(rotaCellAt(e.clientX, e.clientY));
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      setHeld(false);
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (!d?.live) return;              // never travelled: the click still runs
      justDragged.current = true;
      const cell = rotaCellAt(e.clientX, e.clientY);
      setRotaHover(null);
      if (cell) {
        const msg = dropMessage(placeJobsOnPlanner(cell, [jobId], opts?.projectId));
        if (msg) opts?.onToast?.(msg);
        return;
      }
      /**
       * No notebook square under the hand — maybe the BOARD itself is.
       *
       * Every list that draws a job can now put its tile down: let go over
       * empty board and the job lands there, out of whatever notebook or
       * group was holding it. The board's own probe decides whether the point
       * really is its empty surface, so a release over a widget or a tile
       * places nothing.
       */
      const place = boardDropAt(e.clientX, e.clientY);
      if (!place) return;
      const boardMsg = place([jobId], opts?.projectId);
      if (boardMsg) opts?.onToast?.(boardMsg);
    },
    onPointerCancel: () => { drag.current = null; setHeld(false); setRotaHover(null); },
  };

  /** See-through while held, so the landing square shows through the hand. */
  const style: React.CSSProperties = {
    opacity: held ? 0.45 : undefined,
    transition: 'opacity 120ms ease',
    touchAction: 'none',
  };

  return { handlers, held, style, draggable: enabled && (anyRota() || anyBoardDrop()) };
}
