import React, { useEffect, useState } from 'react';
import { useStore } from '../../data/store';
import { subscribePeers, PresencePeer } from '../../data/presence';
import { TILE_W, TILE_H } from './BoardItems';

/**
 * The other people on this board, drawn live: a named cursor in each
 * person's colour, and a translucent ghost of any tile their hand is
 * mid-drag with — the Google-Sheets feeling. Rendered INSIDE the world
 * layer so board coordinates need no conversion; every piece of chrome is
 * divided by the zoom, a marker rather than part of the drawing. The whole
 * layer is pointer-events-none: a colleague's cursor must never catch a
 * click meant for the tile under it.
 */
export function PresenceLayer({ pid, board, zoom }: {
  pid: string;
  board: string;
  zoom: number;
}) {
  const apartments = useStore(s => s.apartments);
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  // A peer whose row stops refreshing FADES OUT: staleness is judged on our
  // own clock tick, because onValue only fires when something changes.
  const [, setTick] = useState(0);
  useEffect(() => subscribePeers(pid, board, setPeers), [pid, board]);
  useEffect(() => {
    const t = window.setInterval(() => setTick(n => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const fresh = peers.filter(p => (p.at ?? 0) > now - 15_000);
  if (!fresh.length) return null;

  const nameOf = (id: string) => apartments.find(a => a.id === id)?.displayName || '';

  return (
    <div className="absolute inset-0 pointer-events-none" data-presence-layer style={{ zIndex: 60 }}>
      {fresh.map(p => (
        <React.Fragment key={p.key}>
          {/* Tiles under that hand, mid-drag — one record, their positions. */}
          {p.drag && Object.entries(p.drag).slice(0, 20).map(([id, pos]) => (
            <div key={id} data-presence-drag={id}
              className="absolute rounded-xl"
              style={{
                left: pos.x, top: pos.y, width: TILE_W, height: TILE_H,
                border: `${2 / zoom}px dashed ${p.color}`,
                backgroundColor: `${p.color}22`,
              }}>
              <span className="absolute left-0 top-0 px-1.5 py-0.5 font-bold text-white truncate max-w-full"
                style={{ backgroundColor: p.color, fontSize: 10 / zoom, borderRadius: `${8 / zoom}px 0 ${6 / zoom}px 0` }}>
                {nameOf(id) || '…'}
              </span>
            </div>
          ))}
          {p.x != null && p.y != null && (
            <div data-presence-cursor={p.key} className="absolute"
              style={{ left: p.x, top: p.y, transform: `scale(${1 / zoom})`, transformOrigin: '0 0' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ display: 'block' }}>
                <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill={p.color}
                  stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span className="px-1.5 py-0.5 rounded-md font-bold text-white whitespace-nowrap"
                style={{ backgroundColor: p.color, fontSize: 10.5, marginInlineStart: 10 }}>
                {p.name}
              </span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
