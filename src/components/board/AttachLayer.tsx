import React, { useEffect, useState } from 'react';
import { Apartment, CanvasElement } from '../../types';
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

/** Where the art sits, given its host's current box. */
function attachPoint(host: HostBox, el: CanvasElement) {
  const fx = el.attachAt?.fx ?? 0.5;
  const fy = el.attachAt?.fy ?? 0;
  return { x: host.x + host.w * fx - el.w / 2, y: host.y + host.h * fy - el.h / 2 };
}

export const AttachedArtLayer = React.memo(function AttachedArtLayer({
  elements, hosts, onSelect,
}: {
  elements: CanvasElement[];
  hosts: Map<string, HostBox>;
  onSelect?: (el: CanvasElement) => void;
}) {
  const stuck = elements.filter(el => el.type === 'clipart' && el.attachedTo);
  if (stuck.length === 0) return null;

  return (
    <>
      {stuck.map(el => {
        const host = hosts.get(el.attachedTo!);
        if (!host) return null;              // its host is gone; draw nothing
        const p = attachPoint(host, el);
        return (
          <div
            key={el.id}
            onPointerDown={e => { e.stopPropagation(); onSelect?.(el); }}
            className="absolute board-stick"
            style={{ left: p.x, top: p.y, width: el.w, height: el.h, zIndex: 22 }}
            title="Attached — drag the job and it comes along"
          >
            <ClipArtNode el={el} />
          </div>
        );
      })}
    </>
  );
});

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
