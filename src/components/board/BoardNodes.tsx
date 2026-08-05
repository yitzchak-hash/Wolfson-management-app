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
  elements, zoom, panX, onEdit,
}: {
  elements: CanvasElement[];
  zoom: number;
  panX: number;
  onEdit?: (el: CanvasElement) => void;
}) {
  const pinned = elements.filter(el => el.type === 'title' && el.pinned);
  if (pinned.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {pinned.map(el => (
        <div
          key={el.id}
          onDoubleClick={() => onEdit?.(el)}
          className="absolute pointer-events-auto select-none"
          style={{
            // X follows the board; Y is nailed to the viewport.
            left: panX + el.x * zoom,
            top: el.pinTop ?? 12,
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
      ))}
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

/** Small decorative pieces that make the board feel like a real board. */
export function ClipArtNode({ el }: { el: CanvasElement }) {
  const art = el.art ?? 'pin';
  const c = el.color || '#dc2626';
  const common = { width: '100%', height: '100%' } as const;

  switch (art) {
    case 'pin':
      return (
        <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
          <circle cx="20" cy="15" r="10" fill={c} />
          <circle cx="16.5" cy="11.5" r="3.4" fill="rgba(255,255,255,.55)" />
          <path d="M20 24 L20 37" stroke="#6b7280" strokeWidth="2.4" strokeLinecap="round" />
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
      return (
        <svg viewBox="0 0 40 40" style={common} fill="none" stroke="#64748b" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d="M26 12v14a7 7 0 01-14 0V11a4.5 4.5 0 019 0v14a2.2 2.2 0 01-4.4 0V13" />
        </svg>
      );
    case 'marker':
      return (
        <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
          <rect x="14" y="6" width="12" height="20" rx="2" fill={c} />
          <path d="M14 26 L20 36 L26 26 Z" fill="#334155" />
          <rect x="14" y="22" width="12" height="4" fill="rgba(0,0,0,.18)" />
        </svg>
      );
    case 'document':
      // Carries a real file. With one attached it turns into a link you can
      // click; without one it is a blank sheet waiting for a document.
      return (
        <span className="relative block w-full h-full">
          <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
            <path d="M9 4h16l6 6v26H9z" fill="#fff" stroke={el.docUrl ? '#2d6a9f' : '#94a3b8'} strokeWidth="1.6" />
            <path d="M25 4v6h6" fill="none" stroke={el.docUrl ? '#2d6a9f' : '#94a3b8'} strokeWidth="1.6" />
            <path d="M14 17h12M14 22h12M14 27h8" stroke={el.docUrl ? '#93c5fd' : '#cbd5e1'} strokeWidth="1.8" strokeLinecap="round" />
            {el.docUrl && <circle cx="31" cy="31" r="7" fill="#2d6a9f" />}
            {el.docUrl && <path d="M31 27.5v6.5M28 31l3 3 3-3" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
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
    case 'sticky-stack':
      return (
        <svg viewBox="0 0 40 40" style={common} aria-hidden="true">
          <rect x="6" y="10" width="26" height="26" rx="2" fill="#fcd34d" />
          <rect x="9" y="7" width="26" height="26" rx="2" fill="#fde68a" />
          <rect x="12" y="4" width="24" height="24" rx="2" fill="#fef3c7" stroke="rgba(0,0,0,.06)" />
        </svg>
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
          <path d="M20 4l4.8 10.2 11.2 1.5-8.2 7.7 2.1 11L20 29.1 10.1 34.4l2.1-11L4 15.7l11.2-1.5z" fill={c} />
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
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={el.art === 'marker' ? 0.45 : 1}
        />
      ))}
    </svg>
  );
});
