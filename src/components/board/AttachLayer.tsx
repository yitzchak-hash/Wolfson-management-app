import React from 'react';
import { X, Unlink } from 'lucide-react';
import { CanvasElement } from '../../types';
import { ClipArtNode } from './BoardNodes';

/**
 * Clip art stuck to things, and arrows drawn between them.
 *
 * Both live in one layer because both are DERIVED positions: a pin stuck
 * through a tile has no position of its own — it has the tile's, plus an
 * offset — and an arrow has no position at all, only two ends. Storing them
 * like ordinary nodes would mean re-writing their coordinates every time
 * something they are attached to moves, which is exactly the kind of bookkeeping
 * that drifts out of step. Here they are computed from wherever their host is
 * right now, so they simply cannot be wrong.
 */

export interface HostBox { id: string; x: number; y: number; w: number; h: number }

export type Anchor = 'tl' | 'tm' | 'tr' | 'bl' | 'br';

/**
 * Five places a piece can stick: the four corners and the top middle.
 *
 * Free fractions were worse than they sound. A pin dropped "near the top-left"
 * landed wherever the pointer happened to be, so two pins on two tiles never
 * lined up and nudging a tile by a pixel moved the pin with it. Named anchors
 * mean a pinned corner is the same corner every time.
 */
export const ANCHORS: { id: Anchor; fx: number; fy: number; label: string }[] = [
  { id: 'tl', fx: 0, fy: 0, label: 'Top left' },
  { id: 'tm', fx: 0.5, fy: 0, label: 'Top middle' },
  { id: 'tr', fx: 1, fy: 0, label: 'Top right' },
  { id: 'bl', fx: 0, fy: 1, label: 'Bottom left' },
  { id: 'br', fx: 1, fy: 1, label: 'Bottom right' },
];

const POINT: Record<Anchor, { fx: number; fy: number }> =
  Object.fromEntries(ANCHORS.map(a => [a.id, { fx: a.fx, fy: a.fy }])) as Record<Anchor, { fx: number; fy: number }>;

/** How wide a piece is by default, as a share of whatever it is stuck to. */
export const DEFAULT_ATTACH_SCALE = 0.26;

/** Records made before anchors existed carry a free fraction; read it as the nearest anchor. */
export function anchorOf(el: CanvasElement): Anchor {
  if (el.attachAnchor) return el.attachAnchor;
  const fx = el.attachAt?.fx ?? 1;
  const fy = el.attachAt?.fy ?? 0;
  let best: Anchor = 'tr', bestD = Infinity;
  for (const a of ANCHORS) {
    const dd = (fx - a.fx) ** 2 + (fy - a.fy) ** 2;
    if (dd < bestD) { bestD = dd; best = a.id; }
  }
  return best;
}

/** Nearest anchor to a world point on a host — used while dragging. */
export function nearestAnchor(host: HostBox, wx: number, wy: number): Anchor {
  const fx = (wx - host.x) / Math.max(1, host.w);
  const fy = (wy - host.y) / Math.max(1, host.h);
  let best: Anchor = 'tr', bestD = Infinity;
  for (const a of ANCHORS) {
    // Weighted so the top-middle does not swallow the two top corners on a
    // wide tile: horizontal distance counts for more than vertical.
    const dd = ((fx - a.fx) * 1.35) ** 2 + (fy - a.fy) ** 2;
    if (dd < bestD) { bestD = dd; best = a.id; }
  }
  return best;
}

/**
 * Where and how big the art is, given its host's box right now.
 *
 * The size is derived from the host, not stored — which is the whole point.
 * A pin that stayed 64px while its tile grew would be wrong the moment anyone
 * resized anything, and the owner asked for exactly this: resize the tile,
 * the art resizes with it.
 */
export function attachBox(host: HostBox, el: CanvasElement) {
  const scale = el.attachScale ?? DEFAULT_ATTACH_SCALE;
  const w = Math.max(14, host.w * scale);
  const aspect = el.w > 0 ? el.h / el.w : 1;
  const h = Math.max(10, w * aspect);
  const p = POINT[anchorOf(el)];
  return { x: host.x + host.w * p.fx - w / 2, y: host.y + host.h * p.fy - h / 2, w, h };
}

export const AttachedArtLayer = React.memo(function AttachedArtLayer({
  elements, hosts, selectedIds, onSelect, onDetach, onDelete, onMenu, onGrab,
}: {
  elements: CanvasElement[];
  hosts: Map<string, HostBox>;
  selectedIds?: Set<string>;
  onSelect?: (el: CanvasElement) => void;
  onDetach?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMenu?: (e: React.MouseEvent, el: CanvasElement) => void;
  /** Begins a drag of the attached piece, so it can be moved to another anchor or off. */
  onGrab?: (e: React.PointerEvent, el: CanvasElement) => void;
}) {
  const stuck = elements.filter(el => el.type === 'clipart' && el.attachedTo);
  if (stuck.length === 0) return null;

  return (
    <>
      {stuck.map(el => {
        const host = hosts.get(el.attachedTo!);
        if (!host) return null;              // its host is gone; draw nothing
        const b = attachBox(host, el);
        const on = selectedIds?.has(el.id);
        return (
          <div
            key={el.id}
            data-attached-id={el.id}
            onPointerDown={e => { e.stopPropagation(); onSelect?.(el); onGrab?.(e, el); }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onSelect?.(el); onMenu?.(e, el); }}
            className="absolute board-stick group/art"
            style={{
              left: b.x, top: b.y, width: b.w, height: b.h, zIndex: 22,
              // The hit area is the piece and nothing else. A halo around it —
              // even a few pixels — sits over the tile underneath and makes the
              // tile feel dead exactly where you want to click it.
              pointerEvents: 'auto',
              cursor: 'grab',
              outline: on ? '2px solid rgba(74,168,216,.7)' : undefined,
              outlineOffset: 2,
              borderRadius: 6,
            }}
            title="Stuck on — drag to another corner, or off to unstick"
          >
            <ClipArtNode el={el} />

            {/* Its own two controls, and only on hover of the piece itself. */}
            <span
              className="absolute -top-2 -right-2 flex gap-0.5 opacity-0 group-hover/art:opacity-100 focus-within:opacity-100 transition-opacity"
              style={{ zIndex: 2 }}
            >
              <button data-el-action title="Unstick it"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onDetach?.(el.id); }}
                className="p-[3px] rounded-full bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-[#1e3a5f]">
                <Unlink size={9} />
              </button>
              <button data-el-action title="Remove it"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onDelete?.(el.id); }}
                className="p-[3px] rounded-full bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-red-500">
                <X size={9} />
              </button>
            </span>
          </div>
        );
      })}
    </>
  );
});

/**
 * The five landing spots, shown while a piece is being dragged over something.
 *
 * Without them an attach is a guess — you let go and find out. The one it would
 * snap to is filled in, so the drop is decided before you release.
 */
export function AnchorHints({ host, active }: { host: HostBox | null; active: Anchor | null }) {
  if (!host) return null;
  return (
    <div className="absolute pointer-events-none" style={{ left: host.x, top: host.y, width: host.w, height: host.h, zIndex: 26 }}>
      <div className="absolute inset-0 rounded-xl"
        style={{ outline: '2px dashed rgba(74,168,216,.75)', outlineOffset: 2 }} />
      {ANCHORS.map(a => {
        const on = active === a.id;
        return (
          <span
            key={a.id}
            className="absolute rounded-full"
            style={{
              left: host.w * a.fx, top: host.h * a.fy,
              width: on ? 22 : 13, height: on ? 22 : 13,
              transform: 'translate(-50%,-50%)',
              backgroundColor: on ? '#4aa8d8' : 'rgba(255,255,255,.95)',
              border: `2px solid ${on ? '#1e3a5f' : 'rgba(74,168,216,.8)'}`,
              boxShadow: on ? '0 0 0 5px rgba(74,168,216,.22)' : '0 1px 3px rgba(15,23,42,.2)',
              transition: 'width 90ms, height 90ms, background-color 90ms',
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Arrows between two hosts.
 *
 * Drawn as a curve rather than a straight line: a straight one between two
 * tiles cuts across whatever sits between them, and a gentle arc reads as a
 * connection rather than a strike-through. The line is dashed and animated on
 * first appearance so you can see which way it points.
 */
export const ArrowLayer = React.memo(function ArrowLayer({
  elements, hosts, onSelect,
}: {
  elements: CanvasElement[];
  hosts: Map<string, HostBox>;
  onSelect?: (el: CanvasElement) => void;
}) {
  const arrows = elements.filter(el => el.type === 'arrow' && el.fromId && el.toId);
  if (arrows.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible', zIndex: 21 }}>
      <defs>
        {arrows.map(el => (
          <marker key={`m-${el.id}`} id={`head-${el.id}`} viewBox="0 0 10 10"
            refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={el.color || '#1e3a5f'} />
          </marker>
        ))}
      </defs>
      {arrows.map(el => {
        const a = hosts.get(el.fromId!);
        const b = hosts.get(el.toId!);
        if (!a || !b) return null;

        // Leave from the edge facing the other one, so the line never starts
        // underneath the tile it is coming out of.
        const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
        const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const dx = bc.x - ac.x, dy = bc.y - ac.y;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const from = horizontal
          ? { x: ac.x + Math.sign(dx) * (a.w / 2 + 4), y: ac.y }
          : { x: ac.x, y: ac.y + Math.sign(dy) * (a.h / 2 + 4) };
        const to = horizontal
          ? { x: bc.x - Math.sign(dx) * (b.w / 2 + 10), y: bc.y }
          : { x: bc.x, y: bc.y - Math.sign(dy) * (b.h / 2 + 10) };

        // A shallow arc, bowed perpendicular to the run.
        const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
        const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const bow = Math.min(46, len * 0.16);
        const cx = mx + (horizontal ? 0 : bow);
        const cy = my + (horizontal ? -bow : 0);
        const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;

        return (
          <g key={el.id} className="board-arrow" style={{ pointerEvents: 'stroke' }}
            onPointerDown={e => { e.stopPropagation(); onSelect?.(el); }}>
            {/* A fat invisible line so it can be clicked without hairline aim. */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
            <path
              d={d}
              fill="none"
              stroke={el.color || '#1e3a5f'}
              strokeWidth={el.strokeWidth ?? 2.5}
              strokeLinecap="round"
              markerEnd={`url(#head-${el.id})`}
            />
            {el.text && (
              <text x={cx} y={cy - 6} textAnchor="middle"
                style={{ fontSize: 11, fontWeight: 700, fill: el.color || '#1e3a5f', paintOrder: 'stroke' }}
                stroke="#fff" strokeWidth={3.5}>
                {el.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

/**
 * The moment an arrow is being drawn: one end anchored, the other on the cursor.
 */
export function ArrowDraft({ from, to }: {
  from: HostBox | null; to: { x: number; y: number } | null;
}) {
  if (!from || !to) return null;
  const ac = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible', zIndex: 24 }}>
      <path d={`M ${ac.x} ${ac.y} L ${to.x} ${to.y}`}
        fill="none" stroke="#1e3a5f" strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" />
      <circle cx={to.x} cy={to.y} r={4} fill="#1e3a5f" />
    </svg>
  );
}
