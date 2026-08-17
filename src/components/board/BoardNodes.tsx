import React, { useEffect, useState } from 'react';
import { CanvasElement } from '../../types';

/**
 * Board node renderers beyond notes and boxes.
 *
 * Sizes deliberately differ per type — a countdown does not need the footprint
 * of a section box, and a pin is tiny.
 */

export const NODE_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  note: { w: 165, h: 150 },
  box: { w: 320, h: 220 },
  title: { w: 280, h: 44 },
  countdown: { w: 190, h: 96 },
  stopwatch: { w: 190, h: 96 },
  clipart: { w: 64, h: 64 },
  voice: { w: 190, h: 78 },
  bin: { w: 178, h: 92 },
  stroke: { w: 0, h: 0 },
};

/** Every clip-art piece the picker offers. */
export const ART_KINDS = [
  'pin', 'tape', 'clip', 'marker', 'sticky-stack', 'document', 'arrow', 'star',
] as const;
export type ArtKind = (typeof ART_KINDS)[number];

/** How a stroke's line is shaped. Colour and width are separate from this. */
export type StrokeNib = 'round' | 'chisel' | 'dashed' | 'dotted' | 'soft';

/** The dash pattern for a nib, scaled to the line's own width. */
export function nibDash(nib: StrokeNib | undefined, width: number): string | undefined {
  if (nib === 'dashed') return `${Math.max(6, width * 2.4)} ${Math.max(5, width * 1.8)}`;
  if (nib === 'dotted') return `0.1 ${Math.max(4, width * 1.9)}`;
  return undefined;
}

/**
 * A drawing that stands on its own, rather than ink laid over something.
 *
 * A stroke whose box overlaps nothing is a thing somebody drew — an arrow
 * between two columns, a circle round a group — and it should behave like every
 * other thing on the board: pick it up, move it, resize it. A stroke drawn ON a
 * tile is annotation and keeps the old behaviour, because that is what drawing
 * on something means.
 *
 * The flag lives in the element's own free-form `data` bag, so this needs no new
 * field on the type and therefore no change to the store, the sync or the
 * backup. Everything drawn before this stays exactly as it was.
 */
export function isDrawingNode(el: CanvasElement): boolean {
  return el.type === 'stroke' && !!el.data?.own;
}

/** The polyline, read back out of its stored `"x,y x,y …"` form. */
export function strokePoints(el: CanvasElement | undefined): { x: number; y: number }[] {
  if (!el?.points) return [];
  return el.points.trim().split(/\s+/)
    .map(p => {
      const [x, y] = p.split(',').map(Number);
      return { x, y };
    })
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}

// ─── Pinned title ────────────────────────────────────────────────────────────

/**
 * A title that holds a FIXED SCREEN Y while keeping its board X.
 *
 * That combination is unusual and worth being precise about, because it decides
 * where the element is allowed to live:
 *   - board X  → it pans and zooms sideways with the column it labels
 *   - screen Y → it does not move as you pan up and down
 *   - scales with zoom, exactly like the tiles beneath it
 *
 * Because its hit box is in VIEW space while tiles are in WORLD space, it must
 * render in its own always-on-top layer. Lasso selection works in world space
 * and would otherwise select a title that is visually somewhere else entirely.
 */
export const PinnedTitleLayer = React.memo(function PinnedTitleLayer({
  elements, zoom, panX, onEdit, onMove,
}: {
  elements: CanvasElement[];
  zoom: number;
  panX: number;
  onEdit?: (el: CanvasElement) => void;
  /**
   * Committed once on pointer-up, never per frame — the same rule the board's
   * other drags follow, because writing here serialises the whole project.
   */
  onMove?: (id: string, patch: { x: number; pinTop: number }) => void;
}) {
  const pinned = elements.filter(el => el.type === 'title' && el.pinned);
  const drag = React.useRef<{
    id: string; px: number; py: number; x0: number; top0: number; moved: boolean;
  } | null>(null);
  const [live, setLive] = React.useState<{ id: string; x: number; top: number } | null>(null);
  if (pinned.length === 0) return null;

  /**
   * A pinned title was the one node that could not be moved at all.
   *
   * It keeps its two-coordinate nature while being dragged: sideways writes the
   * BOARD x (divided by zoom, so it tracks the cursor at any zoom), and up-down
   * writes the SCREEN pinTop. Anything else would un-pin it the moment you
   * touched it.
   */
  function down(e: React.PointerEvent, el: CanvasElement) {
    if (!onMove) return;
    e.stopPropagation();
    drag.current = {
      id: el.id, px: e.clientX, py: e.clientY,
      x0: el.x, top0: el.pinTop ?? 12, moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.px) / Math.max(0.05, zoom);
    const dy = e.clientY - d.py;
    if (!d.moved && Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) < 4) return;
    d.moved = true;
    setLive({ id: d.id, x: d.x0 + dx, top: Math.max(0, d.top0 + dy) });
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && live && onMove) onMove(d.id, { x: Math.round(live.x), pinTop: Math.round(live.top) });
    setLive(null);
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {pinned.map(el => {
        const l = live?.id === el.id ? live : null;
        return (
        <div
          key={el.id}
          onDoubleClick={() => onEdit?.(el)}
          onPointerDown={e => down(e, el)}
          onPointerMove={move}
          onPointerUp={up}
          className={`absolute pointer-events-auto select-none ${onMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={{
            // X follows the board; Y is nailed to the viewport.
            left: panX + (l ? l.x : el.x) * zoom,
            top: l ? l.top : (el.pinTop ?? 12),
            touchAction: 'none',
            // Scales with zoom, as specified — including getting small when
            // zoomed far out, which is the intended behaviour here.
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            fontSize: el.fontSize ?? 30,
            fontWeight: el.fontWeight ?? 800,
            color: el.color || '#0f172a',
            fontStyle: el.italic ? 'italic' : 'normal',
            textDecoration: el.underline ? 'underline' : 'none',
            textAlign: el.align ?? 'left',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 0 rgba(255,255,255,.85), 0 0 8px rgba(255,255,255,.7)',
          }}
        >
          {el.text || 'Title'}
        </div>
        );
      })}
    </div>
  );
});

// ─── Countdown ───────────────────────────────────────────────────────────────

function splitDuration(ms: number) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  return { d, h, m, s, past: ms < 0 };
}

export function CountdownNode({ el }: { el: CanvasElement }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!el.targetAt) {
    return <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Set a time</div>;
  }
  const ms = new Date(el.targetAt).getTime() - Date.now();
  const { d, h, m, s, past } = splitDuration(ms);
  const colour = past ? '#dc2626' : d === 0 && h < 4 ? '#d97706' : '#0f172a';

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-2">
      <div className="text-[10px] font-bold text-gray-500 truncate w-full text-center">
        {el.text || 'Countdown'}
      </div>
      <div className="font-black tabular-nums leading-none mt-1" style={{ color: colour, fontSize: 22 }}>
        {d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`}
      </div>
      <div className="text-[9px] text-gray-400 mt-0.5">{past ? 'overdue' : 'remaining'}</div>
    </div>
  );
}

// ─── Stopwatch ───────────────────────────────────────────────────────────────

export function StopwatchNode({ el, onToggle }: { el: CanvasElement; onToggle?: () => void }) {
  const [, tick] = useState(0);
  const running = !!el.startedAt;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const base = el.elapsedMs ?? 0;
  const live = running ? Date.now() - new Date(el.startedAt!).getTime() : 0;
  const { d, h, m, s } = splitDuration(base + live);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-2">
      <div className="text-[10px] font-bold text-gray-500 truncate w-full text-center">
        {el.text || 'Stopwatch'}
      </div>
      <div className="font-black tabular-nums leading-none mt-1" style={{ fontSize: 22 }}>
        {d > 0 ? `${d}d ${h}h` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}
      </div>
      <button
        data-no-drag
        onClick={e => { e.stopPropagation(); onToggle?.(); }}
        className="mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
        style={running ? { backgroundColor: '#fee2e2', color: '#b91c1c' } : { backgroundColor: '#dcfce7', color: '#166534' }}
      >
        {running ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}

// ─── Voice memo ──────────────────────────────────────────────────────────────

/**
 * A short spoken note pinned to the board.
 *
 * The audio itself is NEVER stored in the element record. Recordings go to the
 * job's Drive folder through the existing upload backend and only the resulting
 * URL is kept, so a board full of memos cannot blow the Firestore document limit
 * or the localStorage quota the way inlined base64 would.
 */
export function VoiceMemoNode({
  el, onRecord, onStop, onUpload, recording, busy,
}: {
  el: CanvasElement;
  onRecord: () => void;
  onStop: () => void;
  onUpload?: (file: File) => void;
  recording: boolean;
  busy: boolean;
}) {
  const secs = el.audioSeconds ?? 0;
  return (
    <div className="w-full h-full flex flex-col justify-center px-2.5 gap-1">
      <div className="text-[10px] font-bold text-gray-500 truncate">{el.text || 'Voice memo'}</div>
      {el.audioUrl ? (
        <audio data-no-drag data-el-action controls src={el.audioUrl} className="w-full h-7" />
      ) : (
        // Record OR upload. A memo recorded on a phone and dropped in is just as
        // useful as one spoken at the desk, and often the only one that exists.
        <div className="flex items-center gap-1.5">
          <button
            data-no-drag data-el-action
            onClick={e => { e.stopPropagation(); recording ? onStop() : onRecord(); }}
            disabled={busy}
            className="text-[10px] font-bold px-2 py-1 rounded-full disabled:opacity-50"
            style={recording
              ? { backgroundColor: '#fee2e2', color: '#b91c1c' }
              : { backgroundColor: '#e0f2fe', color: '#0369a1' }}
          >
            {busy ? 'Saving…' : recording ? '■ Stop' : '● Record'}
          </button>
          {!recording && onUpload && (
            <label data-no-drag data-el-action
              className="text-[10px] font-bold px-2 py-1 rounded-full cursor-pointer"
              style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
              Upload
              <input type="file" accept="audio/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ''; }} />
            </label>
          )}
        </div>
      )}
      {secs > 0 && <div className="text-[9px] text-gray-400">{secs}s</div>}
    </div>
  );
}

// ─── Clip art ────────────────────────────────────────────────────────────────

/**
 * The extension, from the name or failing that from the link.
 *
 * A Drive link carries no extension, so a file attached by link falls back to
 * its name — which is why the name is asked for on attach.
 */
export function fileExt(name?: string, url?: string): string | null {
  const from = (v?: string) => {
    if (!v) return null;
    const clean = v.split(/[?#]/)[0];
    const m = clean.match(/\.([a-z0-9]{1,5})$/i);
    return m ? m[1].toLowerCase() : null;
  };
  return from(name) ?? from(url);
}

/** Each format in the colour people already expect it to be. */
export const EXT_COLOR: Record<string, string> = {
  pdf: '#dc2626',
  doc: '#2563eb', docx: '#2563eb', rtf: '#2563eb', txt: '#64748b', md: '#64748b',
  xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a',
  ppt: '#ea580c', pptx: '#ea580c',
  png: '#7c3aed', jpg: '#7c3aed', jpeg: '#7c3aed', gif: '#7c3aed', webp: '#7c3aed',
  heic: '#7c3aed', svg: '#7c3aed',
  dwg: '#0d9488', dxf: '#0d9488', rvt: '#0d9488', ifc: '#0d9488',
  zip: '#a16207', rar: '#a16207', '7z': '#a16207',
  mp4: '#be185d', mov: '#be185d', avi: '#be185d',
};

/** Small decorative pieces that make the board feel like a real board. */
/**
 * Two of these were furniture pretending to be tools.
 *
 * A pad of sticky notes you cannot take a note from, and a marker pen you
 * cannot pick up, are pictures of stationery — which is what "I don't know what
 * the point of it is" meant. Both do the obvious thing now: the pad hands you a
 * note, the marker hands you the pen in its own colour. Tape stays decoration,
 * and its blurb says so.
 */
export const USABLE_ART: Record<string, string> = {
  'sticky-stack': 'Take a note from the pad',
  marker: 'Pick up this pen',
};

export function ClipArtNode({ el, onUse }: { el: CanvasElement; onUse?: (art: string) => void }) {
  const art = el.art ?? 'pin';
  const c = el.color || '#dc2626';
  const common = { width: '100%', height: '100%' } as const;

  switch (art) {
    case 'pin':
      // Seen slightly from above, the way a pin pushed into a board actually
      // looks: a domed head, a collar catching the light, a needle going away
      // from you, and a soft shadow on the surface it is stuck in.
      return (
        <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
          <defs>
            <radialGradient id={`pinHead-${c.replace('#', '')}`} cx="34%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#fff" stopOpacity=".85" />
              <stop offset="42%" stopColor={c} />
              <stop offset="100%" stopColor="#000" stopOpacity=".35" />
            </radialGradient>
          </defs>
          <ellipse cx="21.5" cy="33" rx="6" ry="2" fill="rgba(0,0,0,.20)" />
          <path d="M19.6 21 L21.4 34.5" stroke="#7b8493" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M19.9 21 L20.7 28" stroke="rgba(255,255,255,.5)" strokeWidth=".8" strokeLinecap="round" />
          <ellipse cx="19" cy="19.5" rx="7.4" ry="3.1" fill={c} opacity=".55" />
          <circle cx="19" cy="15" r="9.4" fill={`url(#pinHead-${c.replace('#', '')})`} />
          <ellipse cx="15.6" cy="10.8" rx="3.2" ry="2.2" fill="rgba(255,255,255,.7)"
            transform="rotate(-28 15.6 10.8)" />
          <circle cx="19" cy="15" r="9.4" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth=".8" />
        </svg>
      );
    case 'tape':
      return (
        <svg viewBox="0 0 60 26" style={common} aria-hidden="true">
          <rect x="1" y="4" width="58" height="18" rx="1" fill="rgba(250,240,200,.82)" stroke="rgba(160,140,80,.45)" />
          <path d="M1 4 L6 8 L1 12 M59 14 L54 18 L59 22" fill="none" stroke="rgba(160,140,80,.35)" />
        </svg>
      );
    case 'clip':
      // Wire with a highlight down one side, so it reads as metal.
      return (
        <svg viewBox="0 0 40 40" style={common} fill="none" aria-hidden="true">
          <path d="M26 12v14a7 7 0 01-14 0V11a4.5 4.5 0 019 0v14a2.2 2.2 0 01-4.4 0V13"
            stroke="rgba(0,0,0,.18)" strokeWidth="4.6" strokeLinecap="round" transform="translate(.8 1)" />
          <path d="M26 12v14a7 7 0 01-14 0V11a4.5 4.5 0 019 0v14a2.2 2.2 0 01-4.4 0V13"
            stroke="#7c8798" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M25 13v13a6 6 0 01-12 0V11.5"
            stroke="rgba(255,255,255,.65)" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
    case 'marker':
      return (
        <span className="relative block w-full h-full">
          <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
            <rect x="14" y="6" width="12" height="20" rx="2" fill={c} />
            <path d="M14 26 L20 36 L26 26 Z" fill="#334155" />
            <rect x="14" y="22" width="12" height="4" fill="rgba(0,0,0,.18)" />
          </svg>
          {onUse && (
            <button data-no-drag data-el-action title={USABLE_ART.marker}
              onClick={e => { e.stopPropagation(); onUse('marker'); }}
              className="absolute inset-0" />
          )}
        </span>
      );
    case 'document': {
      // Carries a real file. With one attached it turns into a link you can
      // click; without one it is a blank sheet waiting for a document.
      //
      // Once there IS a file, the sheet says which KIND — PDF, PNG, XLSX —
      // across the middle of it, in that format's own colour. A row of
      // identical grey pages tells you nothing about what is on the board.
      const ext = fileExt(el.docName, el.docUrl);
      const tint = ext ? EXT_COLOR[ext] ?? '#475569' : null;
      const ink = el.docUrl ? (tint ?? '#2d6a9f') : '#94a3b8';
      return (
        <span className="relative block w-full h-full">
          <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
            <path d="M9 4h16l6 6v26H9z" fill="#fff" stroke={ink} strokeWidth="1.6" />
            <path d="M25 4v6h6" fill="none" stroke={ink} strokeWidth="1.6" />
            {ext ? (
              <>
                {/* The band and the wording ARE the icon once a file is on it. */}
                <rect x="6" y="19" width="28" height="11" rx="2" fill={ink} />
                <text
                  x="20" y="27.4" textAnchor="middle"
                  style={{ fontSize: ext.length > 3 ? 7 : 8.4, fontWeight: 900, fill: '#fff',
                           fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif', letterSpacing: '.4px' }}
                >
                  {ext.toUpperCase()}
                </text>
              </>
            ) : (
              <path d="M14 17h12M14 22h12M14 27h8" stroke={el.docUrl ? '#93c5fd' : '#cbd5e1'} strokeWidth="1.8" strokeLinecap="round" />
            )}
            {el.docUrl && !ext && <circle cx="31" cy="31" r="7" fill="#2d6a9f" />}
            {el.docUrl && !ext && <path d="M31 27.5v6.5M28 31l3 3 3-3" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
          {el.docUrl && (
            <a
              data-no-drag data-el-action
              href={el.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title={`Open ${el.docName || 'the document'}`}
              className="absolute inset-0"
            />
          )}
          {el.docName && (
            <span className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5 text-[8px] font-bold text-gray-500 whitespace-nowrap max-w-[110px] truncate">
              {el.docName}
            </span>
          )}
        </span>
      );
    }
    case 'sticky-stack':
      return (
        <span className="relative block w-full h-full group/pad">
          <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
            <rect x="6" y="10" width="26" height="26" rx="2" fill="#fcd34d" />
            <rect x="9" y="7" width="26" height="26" rx="2" fill="#fde68a" />
            {/* The top sheet lifts a little on hover, so it reads as a pad you
                can take from rather than a picture of one. */}
            <rect x="12" y="4" width="24" height="24" rx="2" fill="#fef3c7" stroke="rgba(0,0,0,.06)"
              className="transition-transform"
              style={{ transformOrigin: 'center', transform: 'translateY(0)' }} />
          </svg>
          {onUse && (
            <button data-no-drag data-el-action title={USABLE_ART['sticky-stack']}
              onClick={e => { e.stopPropagation(); onUse('sticky-stack'); }}
              className="absolute inset-0" />
          )}
        </span>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 40 40" style={common} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 30 L32 10" /><path d="M22 9 L33 9 L33 20" />
        </svg>
      );
    case 'star':
    default:
      return (
        <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
          <defs>
            <linearGradient id={`starF-${c.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity=".55" />
              <stop offset="45%" stopColor={c} />
              <stop offset="100%" stopColor="#000" stopOpacity=".22" />
            </linearGradient>
          </defs>
          <path d="M20 4l4.8 10.2 11.2 1.5-8.2 7.7 2.1 11L20 29.1 10.1 34.4l2.1-11L4 15.7l11.2-1.5z"
            fill="rgba(0,0,0,.18)" transform="translate(.7 1.1)" />
          <path d="M20 4l4.8 10.2 11.2 1.5-8.2 7.7 2.1 11L20 29.1 10.1 34.4l2.1-11L4 15.7l11.2-1.5z"
            fill={`url(#starF-${c.replace('#', '')})`} stroke={c} strokeWidth=".7" strokeLinejoin="round" />
        </svg>
      );
  }
}

// ─── Freehand stroke ─────────────────────────────────────────────────────────

/**
 * Drawn strokes live in WORLD coordinates inside the transformed layer, so they
 * pan and zoom with everything else. One record per stroke — never one per
 * point, which would flood both the store and Firestore.
 */
/**
 * Every stroke it is handed, so a surface that has no node for one — the
 * wallboard, an export — still shows the ink. The editable board hands it the
 * ink MINUS the drawings that have become nodes of their own, because those
 * draw inside their node and would otherwise be on the board twice, with the
 * copy down here failing to follow while the node was moved or resized.
 */
export const StrokeLayer = React.memo(function StrokeLayer({ elements }: { elements: CanvasElement[] }) {
  const strokes = elements.filter(el => el.type === 'stroke' && el.points);
  if (strokes.length === 0) return null;
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }} aria-hidden="true">
      {strokes.map(el => (
        <polyline
          key={el.id}
          points={el.points}
          fill="none"
          stroke={el.color || '#1e3a5f'}
          strokeWidth={el.strokeWidth ?? 3}
          // A chisel nib is square-ended, which is what makes a highlighter
          // look like a highlighter rather than a fat round pen.
          strokeLinecap={el.nib === 'chisel' ? 'butt' : 'round'}
          strokeLinejoin={el.nib === 'chisel' ? 'miter' : 'round'}
          strokeDasharray={nibDash(el.nib, el.strokeWidth ?? 3)}
          opacity={el.nib === 'soft' ? 0.32 : el.art === 'marker' ? 0.45 : 1}
        />
      ))}
    </svg>
  );
});

/**
 * The same ink, drawn INSIDE a node so it can be picked up and resized.
 *
 * The polyline is still one record holding one world-space path — the viewBox is
 * the path's own bounding box, so at rest this draws pixel-for-pixel what the
 * layer above would have drawn, and a resize simply maps that box onto the
 * node's box. Nothing is rewritten while the gesture is live; the page re-lays
 * the points into the new box once, on release, so everything downstream (the
 * overview, the export, the wallboard) keeps reading true coordinates.
 */
export function StrokeNode({ el }: { el: CanvasElement }) {
  const pts = strokePoints(el);
  if (pts.length < 2) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  // A perfectly straight line has no extent on one axis; a zero-width viewBox
  // is invalid, so it gets one unit to live in.
  const bw = Math.max(1, Math.max(...xs) - x0);
  const bh = Math.max(1, Math.max(...ys) - y0);
  return (
    <svg
      className="w-full h-full pointer-events-none"
      style={{ overflow: 'visible' }}
      viewBox={`${x0} ${y0} ${bw} ${bh}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* The HIT line: invisible, fat, and the only part that takes the
          pointer — grabbing a 3px pen line by its exact pixels is a game
          nobody wins. Events land here and bubble to the node's handlers. */}
      <polyline
        points={el.points}
        fill="none"
        stroke="rgba(0,0,0,0)"
        strokeWidth={(el.strokeWidth ?? 3) + 14}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: 'visibleStroke', cursor: 'grab' }}
      />
      <polyline
        points={el.points}
        fill="none"
        stroke={el.color || '#1e3a5f'}
        strokeWidth={el.strokeWidth ?? 3}
        strokeLinecap={el.nib === 'chisel' ? 'butt' : 'round'}
        strokeLinejoin={el.nib === 'chisel' ? 'miter' : 'round'}
        strokeDasharray={nibDash(el.nib, el.strokeWidth ?? 3)}
        opacity={el.nib === 'soft' ? 0.32 : el.art === 'marker' ? 0.45 : 1}
      />
    </svg>
  );
}
