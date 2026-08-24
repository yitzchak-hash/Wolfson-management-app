import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../data/store';
import { TvRect, tvVisibleRect, regionForVisible, ratioOfShape } from '../../data/tvRegion';
import { loadTvScreens, screenIsLive, shapeNameOf, TvScreenPresence } from '../../data/tvScreens';
import { isFirebaseConfigured } from '../../data/firebase';
import { TvIcon } from '../ui/BrandIcons';

/**
 * Aiming the TVs from the board itself.
 *
 * The TV button used to shade one read-only rectangle — the shared region,
 * scale ignored, immovable. Now it opens a small menu of the ACTUAL panels
 * (every open /tv page reports itself to the `tvScreens` collection, named in
 * settings), and picking one lays that panel's green frame over the real
 * work: drag the frame to aim the TV, pull its corner to change how much it
 * takes in. The frame is the EFFECTIVE view — region, shape and display size
 * folded in through tvRegion.ts, the same arithmetic the wall draws with —
 * so the green rectangle is exactly what that panel shows, and an open panel
 * follows the drag within seconds through the settings listener.
 */

export interface TvPick {
  /** The panel's minted id, or null for the shared default every TV without its own setup follows. */
  id: string | null;
  /** The panel's real shape (w/h) — from its own report, or the saved shape for the default. */
  ratio: number;
  /** What to write on the frame. */
  label: string;
}

/** The panel's display name: the office's name for it, else its minted tag. */
function screenName(id: string, stored: Record<string, { name?: string }> | undefined): string {
  return stored?.[id]?.name?.trim() || `TV ${id.slice(4, 8).toUpperCase()}`;
}

/**
 * The dropdown under the TV button: which TV are we talking about?
 *
 * Rendered through a PORTAL — the board header is a flex item with its own
 * stacking context, so no z-index on an in-place menu could lift it above the
 * board's floating chrome (the workspace picker's disease, cured the same
 * way). Outside-press close checks both the menu and the button that opened
 * it, or the opening click closes it again.
 */
export function TvPickMenu({ anchor, ignore, current, onPick, onHide, onClose }: {
  anchor: DOMRect;
  ignore: React.RefObject<HTMLElement | null>;
  current: TvPick | null;
  onPick: (p: TvPick) => void;
  onHide: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [screens, setScreens] = useState<TvScreenPresence[] | null>(null);
  const bag = useStore(st => st.boardSettings).__tv ?? {};

  useEffect(() => {
    let stale = false;
    if (!isFirebaseConfigured) { setScreens([]); return; }
    loadTvScreens().then(rows => { if (!stale) setScreens(rows); });
    return () => { stale = true; };
  }, []);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (ignore.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [ignore, onClose]);

  const stored = bag.tvScreens;
  const row = (key: string, picked: boolean, dot: string | null, title: string, sub: string,
    act: () => void) => (
    <button key={key} data-tv-menu-row={key}
      onClick={act}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                  ${picked ? 'bg-[#16a34a]/10' : 'hover:bg-slate-50'}`}>
      {dot !== null
        ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
        : <TvIcon size={13} />}
      <span className="flex-1 min-w-0">
        <span className={`block text-[12.5px] font-bold truncate ${picked ? 'text-[#15803d]' : 'text-gray-800'}`}>
          {title}
        </span>
        <span className="block text-[10.5px] text-gray-400 truncate">{sub}</span>
      </span>
      {picked && <span className="text-[10px] font-bold text-[#15803d] flex-shrink-0">shown</span>}
    </button>
  );

  const W = 264;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8));
  return createPortal(
    <div ref={menuRef} data-tv-menu
      className="fixed z-[100] rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden"
      style={{ left, top: anchor.bottom + 6, width: W }}>
      <div className="px-3 pt-2.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
        Which TV?
      </div>

      {/* The shared default — what any panel without its own setup shows. */}
      {row('default', current?.id === null && !!current, null,
        'All TVs (default)',
        bag.tvView ? 'aimed at a slice of the board' : 'showing the whole board',
        () => onPick({ id: null, ratio: ratioOfShape(bag.tvShape), label: 'All TVs (default)' }))}

      {screens === null && (
        <div className="px-3 py-2 text-[11px] text-gray-400">Looking for TVs…</div>
      )}
      {screens?.map(s => {
        const name = screenName(s.id, stored);
        const own = stored?.[s.id]?.view;
        return row(s.id, current?.id === s.id,
          screenIsLive(s) ? '#16a34a' : '#cbd5e1',
          name,
          `${shapeNameOf(s.w, s.h)} · ${own ? 'its own slice' : 'follows the default'}`
            + (screenIsLive(s) ? ' · showing now' : ''),
          () => onPick({
            id: s.id,
            ratio: s.w > 0 && s.h > 0 ? s.w / s.h : ratioOfShape(bag.tvShape),
            label: name,
          }));
      })}
      {screens?.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-gray-400 leading-snug">
          {isFirebaseConfigured
            ? 'No TV has reported yet — open the TV link on a panel and it appears here within a minute.'
            : 'TVs report themselves through cloud sync, which is not set up in this browser.'}
        </div>
      )}

      {current && (
        <button data-tv-menu-hide onClick={onHide}
          className="w-full px-3 py-2 text-left text-[11.5px] font-bold text-gray-500 hover:bg-slate-50 border-t border-gray-100">
          Hide the frame
        </button>
      )}
    </div>,
    document.body,
  );
}

/**
 * The picked TV's green frame, laid over the real board — draggable and
 * resizable, writing straight into that panel's own settings.
 */
export function TvFrameLayer({ pan, zoom, pick }: {
  pan: { x: number; y: number };
  zoom: number;
  pick: TvPick;
}) {
  const { apartments, canvasElements, boardSettings, setTvSetting } = useStore();
  const bag = boardSettings.__tv ?? {};
  const entry = pick.id ? bag.tvScreens?.[pick.id] : undefined;
  // The panel's own resolution first, the shared fallback after — the TV's rule.
  const storedRegion = pick.id ? (entry?.view ?? bag.tvView) : bag.tvView;
  const scale = Math.min(3, (pick.id ? entry?.scale : undefined) ?? bag.tvScale ?? 1);
  const tvBoard = bag.tvBoard ?? '';

  const [live, setLive] = useState<TvRect | null>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; px: number; py: number; start: TvRect } | null>(null);

  /**
   * Where the wall would land with NOTHING set: the content box, the TV
   * page's own fallback rule reproduced number for number (its filters, its
   * fallback grid, its 40px pad), so the frame is honest before a region
   * exists — and the first drag of it mints one.
   */
  const contentBox = useMemo(() => {
    const jobs = apartments.filter(a =>
      a.buildingId === 'G' && !a.isUnnamed && !a.boardBin && a.showOnTv !== false);
    const els = canvasElements.filter(el =>
      (el.board ?? '') === tvBoard && el.showOnTv !== false && el.type !== 'stroke');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    jobs.forEach((job, i) => {
      const at = tvBoard ? job.viewPos?.[tvBoard] : undefined;
      const x = at?.x ?? job.canvasX ?? 24 + (i % 6) * 240;
      const y = at?.y ?? job.canvasY ?? 24 + Math.floor(i / 6) * 150;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 215); maxY = Math.max(maxY, y + 132);
    });
    els.forEach(el => {
      minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.w); maxY = Math.max(maxY, el.y + el.h);
    });
    if (minX === Infinity) return null;
    const pad = 40;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [apartments, canvasElements, tvBoard]);

  // A saved region that no longer touches any content is dead — the wall
  // falls back to fitting the content, so the frame must too.
  const regionAlive = !!(storedRegion && storedRegion.w > 0 && storedRegion.h > 0
    && (!contentBox
      || (storedRegion.x < contentBox.x + contentBox.w && storedRegion.x + storedRegion.w > contentBox.x
        && storedRegion.y < contentBox.y + contentBox.h && storedRegion.y + storedRegion.h > contentBox.y)));
  const frameBox = regionAlive ? storedRegion! : contentBox;
  if (!frameBox) return null;

  /** What the panel actually shows — THE green frame. */
  const vis = live ?? tvVisibleRect(frameBox, pick.ratio, scale);

  const commit = (v: TvRect) => {
    const r = regionForVisible(v, scale);
    if (pick.id) {
      setTvSetting('tvScreens', {
        ...(bag.tvScreens ?? {}),
        [pick.id]: { ...(bag.tvScreens?.[pick.id] ?? {}), view: r },
      });
    } else {
      setTvSetting('tvView', r);
    }
  };

  function down(mode: 'move' | 'resize') {
    return (e: React.PointerEvent) => {
      // The board viewport pans unclaimed presses; this one is claimed.
      e.preventDefault(); e.stopPropagation();
      dragRef.current = { mode, px: e.clientX, py: e.clientY, start: { ...vis } };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
  }
  function move(e: React.PointerEvent) {
    const st = dragRef.current;
    if (!st) return;
    e.stopPropagation();
    // Screen delta -> board delta: the layer is drawn inside the board's
    // scale, so a raw delta moves the frame at the wrong speed at any zoom
    // but 100% — the documented trap.
    const dx = (e.clientX - st.px) / zoom;
    const dy = (e.clientY - st.py) / zoom;
    if (st.mode === 'move') {
      setLive({ ...st.start, x: st.start.x + dx, y: st.start.y + dy });
    } else {
      // Ratio-locked, like the picker: the corner drives whichever axis the
      // hand pulled harder and the other follows the panel's shape.
      const w = Math.max(240, Math.max(st.start.w + dx, (st.start.h + dy) * pick.ratio));
      setLive({ ...st.start, w, h: w / pick.ratio });
    }
  }
  function up(e: React.PointerEvent) {
    e.stopPropagation();
    if (dragRef.current && live) commit(live);
    dragRef.current = null;
    setLive(null);
  }

  // Chrome that must stay hand-sized whatever the zoom — a marker, not part
  // of the drawing.
  const bw = 2 / zoom;
  return (
    <div
      data-tv-overlay
      className="absolute pointer-events-none"
      style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        left: 0, top: 0, width: 1, height: 1,
        zIndex: 40,
      }}
    >
      <div
        data-tv-frame
        onPointerDown={down('move')}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="absolute pointer-events-auto cursor-move"
        style={{
          left: vis.x, top: vis.y, width: vis.w, height: vis.h,
          backgroundColor: 'rgba(22,163,74,.10)',
          border: `${bw}px solid rgba(22,163,74,.9)`,
          borderRadius: 4 / zoom,
          boxShadow: `0 0 0 ${1 / zoom}px rgba(255,255,255,.7)`,
        }}
      >
        <span
          className="absolute left-0 px-2 py-0.5 rounded-md font-bold text-white whitespace-nowrap pointer-events-none"
          style={{
            bottom: '100%', marginBottom: 4 / zoom,
            backgroundColor: '#16a34a',
            fontSize: 11 / zoom, borderRadius: 5 / zoom,
          }}>
          {pick.label} · drag to aim · corner resizes
        </span>
        <span
          data-tv-frame-handle
          onPointerDown={down('resize')}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="absolute pointer-events-auto cursor-se-resize"
          style={{
            right: -8 / zoom, bottom: -8 / zoom,
            width: 16 / zoom, height: 16 / zoom,
            backgroundColor: '#16a34a',
            border: `${2 / zoom}px solid #fff`,
            borderRadius: 3 / zoom,
            boxShadow: `0 ${1 / zoom}px ${4 / zoom}px rgba(15,23,42,.35)`,
          }}
        />
      </div>
    </div>
  );
}
