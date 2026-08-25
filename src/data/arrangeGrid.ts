/**
 * THE ARRANGE GRID — the exact arithmetic the owner approved on the mockup
 * page ("The Arrange Feature" artifact, 2026-08-25). Change it there and
 * here together, or the page stops being the truth about the feature.
 *
 * The rules, as approved:
 *  - even gaps of GAP between everything, rows and columns alike;
 *  - tallest things first, packed into rows; a row is as tall as its tallest
 *    member and shorter members centre vertically inside it;
 *  - the block aims a touch wider than tall (√(area × 1.4)); a row may run
 *    past the aim by up to 0.65 of the incoming item's width — without that
 *    tolerance nine equal tiles pack two per row and the block comes out
 *    tall instead of square-ish (verified shapes: 2→[2], 4→[2,2], 9→[3,3,3]);
 *  - each row centres within the widest row, so the block reads symmetrical;
 *  - nothing is ever resized — Arrange moves things.
 *
 * Pure: no store, no DOM. The caller centres the block (on the selection's
 * old centre for Arrange, on the paste point for a paste) and writes.
 */

export const ARRANGE_GAP = 18;

export interface ArrangeItem {
  id: string;
  w: number;
  h: number;
}

export interface ArrangedBlock {
  /** id → position of the item's top-left, relative to the block's top-left. */
  pos: Map<string, { x: number; y: number }>;
  blockW: number;
  blockH: number;
}

export function arrangeGrid(items: ArrangeItem[], gap = ARRANGE_GAP): ArrangedBlock {
  if (items.length === 0) return { pos: new Map(), blockW: 0, blockH: 0 };
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w);
  const totalArea = sorted.reduce((s, i) => s + (i.w + gap) * (i.h + gap), 0);
  const targetW = Math.max(Math.sqrt(totalArea * 1.4), Math.max(...sorted.map(i => i.w)));

  const rows: ArrangeItem[][] = [];
  let row: ArrangeItem[] = [];
  let roww = 0;
  for (const it of sorted) {
    const need = (row.length ? gap : 0) + it.w;
    if (row.length && roww + need > targetW + it.w * 0.65) { rows.push(row); row = []; roww = 0; }
    row.push(it);
    roww += (row.length > 1 ? gap : 0) + it.w;
  }
  if (row.length) rows.push(row);

  const rowW = (r: ArrangeItem[]) => r.reduce((s, i, k) => s + i.w + (k ? gap : 0), 0);
  const blockW = Math.max(...rows.map(rowW));
  const pos = new Map<string, { x: number; y: number }>();
  let y = 0;
  for (const r of rows) {
    let x = (blockW - rowW(r)) / 2;
    const rh = Math.max(...r.map(i => i.h));
    for (const it of r) {
      pos.set(it.id, { x: Math.round(x), y: Math.round(y + (rh - it.h) / 2) });
      x += it.w + gap;
    }
    y += rh + gap;
  }
  return { pos, blockW: Math.round(blockW), blockH: Math.round(y - gap) };
}
