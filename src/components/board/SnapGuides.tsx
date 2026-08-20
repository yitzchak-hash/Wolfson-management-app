import React from 'react';
import { Guide } from '../../data/snapping';

/**
 * The lines and bars that explain a snap, drawn once for every board.
 *
 * The caller supplies the coordinate space — a transformed layer on the main
 * board, the world div inside a group — and this draws into it in BOARD units.
 * Everything that is a MARKER rather than part of the drawing is divided by
 * the zoom, so a guide keeps its thickness and its type size on screen at 25%
 * and at 300% alike.
 */
export function SnapGuides({ guides, zoom }: { guides: Guide[]; zoom: number }) {
  if (!guides.length) return null;
  return (
    <>
      {guides.map((g, i) => (
        g.gap
          ? <SpacingBar key={i} g={g} zoom={zoom} />
          : <div key={i} data-snap-guide className="absolute"
              style={{
                backgroundColor: '#e11d48',
                boxShadow: `0 0 0 ${1 / zoom}px rgba(255,255,255,.75)`,
                ...(g.axis === 'x'
                  ? { left: g.at, top: g.from, width: 1.5 / zoom, height: g.to - g.from }
                  : { left: g.from, top: g.at, height: 1.5 / zoom, width: g.to - g.from }),
              }} />
      ))}
    </>
  );
}

/**
 * A spacing bar: the measurement of one gap, drawn across it.
 *
 * Deliberately not the same thing as an alignment line, and deliberately not
 * drawn the same way. An alignment line says "these edges are level" and runs
 * ALONG an edge; a spacing bar says "this space is 40" and runs ACROSS a gap,
 * with a cap at each end and the number on it. Drawn as a plain line it reads
 * as an alignment claim about two things that are not lined up with anything —
 * which is worse than no guide at all.
 */
function SpacingBar({ g, zoom }: { g: Guide; zoom: number }) {
  const k = 1 / zoom;
  // A HORIZONTAL bar is `axis: 'y'` in the snapping module's language: a y
  // position and a span of x.
  const horizontal = g.axis === 'y';
  const len = g.to - g.from;
  const CAP = 9 * k;
  return (
    <div data-snap-guide data-snap-gap className="absolute"
      style={horizontal
        ? { left: g.from, top: g.at - CAP / 2, width: len, height: CAP }
        : { left: g.at - CAP / 2, top: g.from, width: CAP, height: len }}>
      <div className="absolute" style={{
        backgroundColor: '#e11d48',
        ...(horizontal
          ? { left: 0, right: 0, top: CAP / 2 - 0.75 * k, height: 1.5 * k }
          : { top: 0, bottom: 0, left: CAP / 2 - 0.75 * k, width: 1.5 * k }),
      }} />
      {/* A cap at each end, so the bar reads as the measurement of a span
          rather than as a line that happens to stop there. */}
      {[0, 1].map(end => (
        <div key={end} className="absolute" style={{
          backgroundColor: '#e11d48',
          ...(horizontal
            ? { top: 0, height: CAP, width: 1.5 * k, left: end ? len - 1.5 * k : 0 }
            : { left: 0, width: CAP, height: 1.5 * k, top: end ? len - 1.5 * k : 0 }),
        }} />
      ))}
      {g.label && (
        <div className="absolute font-bold tabular-nums whitespace-nowrap"
          style={{
            backgroundColor: '#e11d48', color: '#fff',
            fontSize: 9 * k, lineHeight: 1,
            padding: `${2 * k}px ${4 * k}px`,
            borderRadius: 3 * k,
            ...(horizontal
              ? { left: '50%', top: -12 * k, transform: 'translateX(-50%)' }
              : { top: '50%', left: CAP + 3 * k, transform: 'translateY(-50%)' }),
          }}>
          {g.label}
        </div>
      )}
    </div>
  );
}
