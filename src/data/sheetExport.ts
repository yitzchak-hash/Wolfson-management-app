/**
 * Output (B9, picks 29–31 · 50 · 66 · 68–72): the TzviAir sheet, drawn.
 *
 * The exported sheet copies the architects' own — TzviAir's branded frame
 * recorded in `docs/plan/SHEET-FORMAT.md` (the real PDF stays out of the
 * repo): a LEFT column with the legend, the DRAWING with the plan and the
 * option's blocks, pipes, ducts and lowered ceilings, the INDOOR UNIT cards
 * along the bottom (pick 50 — one per model, its letters collected), and the
 * RIGHT column, the title block: family, contact, address, floor, project,
 * plan type, drawn by, date, version, the checkboxes, the rights, the drop
 * key, חישוב גבס, the offices, the mark.
 *
 * Everything here is PURE and returns strings and numbers: `optionTotals` is
 * the ONE arithmetic behind the sheet's numbers and the Excel's rows (pick
 * 71), `buildSheetSvg` is the sheet as SVG, `boqSheets` the workbook. The
 * rasterising (SVG → PNG → PDF) and Drive live in `sheetRaster.ts`.
 */
import type { CatalogBlock } from './catalog';
import { blockLabel } from './catalog';
import { DROPS, boxNumbers, centroid, dropLabel, type SketchShape } from './gvs';
import { midpoint, pipeLength, pipeLook, roundedPath, type PipeKind, type PipeRules, type SketchPipe } from './pipes';
import { connectionDots, itemBox, rot2, suPerCm, type SketchItem } from './sketchItems';
import type { Sheet } from './xlsx';

export const SHEET_W = 1620;
export const SHEET_H = 1120;
const LEFT_W = 150, RIGHT_W = 236, FRAME_PAD = 26, CARDS_H = 118;
const FONT = "Arial, 'Malgun Gothic', 'Noto Sans Hebrew', sans-serif";
const NAVY = '#1e3a5f', ACCENT = '#4aa8d8', BLUE = '#2f6db3', INK = '#1a1a1a', GREY = '#6b7280', LINE = '#8a8a8a', THIN = '#b9b9b9';
/** The frame's own pale fills for the drop key (the drawing keeps the legend's saturated colours). */
const KEY_FILL: Record<number, string> = { 10: '#daf2cd', 30: '#fdf3a9', 35: '#e8e094', 40: '#f8d7dd' };

export interface SheetTitle {
  family: string;
  phone: string;
  address: string;
  floor: string;
  project: string;
  planType: string;
  drawnBy: string;
  /** DD/MM/YYYY */
  date: string;
  version: number;
  optionName: string;
  /** i of n */
  sheetNo?: { i: number; n: number };
}

export interface UnitCard { model: string; brand: string; name: string; tags: string[]; btu?: string; cfm?: string; dims?: string; watts?: string; n: number }
export interface OptionTotals {
  units: UnitCard[];
  /** metres per kind */
  pipes: Partial<Record<PipeKind, number>>;
  /** metres per duct width (cm) */
  ducts: Record<number, number>;
  /** per drop: m² and running metres */
  gvs: Record<number, { m2: number; runM: number }>;
  gvsM2: number;
  /** every other block on the sheet, counted by model */
  others: { name: string; model: string; brand: string; n: number }[];
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');   // attributes
const txt = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');   // text nodes: a quote is a quote (מ"ר)
const HEB = /[֐-׿]/;
const num1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** Pull the capacity, airflow, dimensions and watts out of a block's own spec words. */
export function unitFacts(specs: string[]): { btu?: string; cfm?: string; dims?: string; watts?: string } {
  const out: { btu?: string; cfm?: string; dims?: string; watts?: string } = {};
  for (const s of specs) {
    if (!out.btu && /btu/i.test(s)) out.btu = s.replace(/\s*btu\/?h?/i, ' BTU').trim();
    else if (!out.cfm && /cfm/i.test(s)) out.cfm = s.trim();
    else if (!out.dims && /\(h\)/i.test(s)) out.dims = s.trim();
    else if (!out.watts && /^\s*[\d.,]+\s*k?w\b/i.test(s)) out.watts = s.trim();
  }
  return out;
}

/** The ONE arithmetic behind the sheet's numbers and the Excel's rows. */
export function optionTotals(items: SketchItem[], shapes: SketchShape[], pipes: SketchPipe[], blocks: Map<string, CatalogBlock>, mPerW: number, tags: Map<string, string>): OptionTotals {
  const units = new Map<string, UnitCard>();
  const others = new Map<string, { name: string; model: string; brand: string; n: number }>();
  for (const it of items) {
    const key = `${it.brand}|${it.model || it.name}`;
    if (it.unit) {
      const card = units.get(key) ?? { model: it.model || it.name, brand: it.brand, name: it.name, tags: [], n: 0, ...unitFacts(blocks.get(it.blockId)?.specs ?? []) };
      card.n++; const tg = tags.get(it.id); if (tg) card.tags.push(tg);
      units.set(key, card);
    } else {
      const row = others.get(key) ?? { name: it.name, model: it.model, brand: it.brand, n: 0 };
      row.n++; others.set(key, row);
    }
  }
  const pipeM: Partial<Record<PipeKind, number>> = {}; const ducts: Record<number, number> = {};
  for (const p of pipes) {
    const m = pipeLength(p.pts, mPerW);
    if (p.kind === 'duct') { const w = p.widthCm ?? 20; ducts[w] = (ducts[w] ?? 0) + m; }
    else pipeM[p.kind] = (pipeM[p.kind] ?? 0) + m;
  }
  const gvs: Record<number, { m2: number; runM: number }> = {}; let gvsM2 = 0;
  for (const s of shapes) { const n = boxNumbers(s.pts, mPerW); const g = gvs[s.drop] ?? { m2: 0, runM: 0 }; g.m2 += n.m2; g.runM += n.runM; gvs[s.drop] = g; gvsM2 += n.m2; }
  const sortTags = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return {
    units: [...units.values()].map(u => ({ ...u, tags: u.tags.sort(sortTags) })).sort((a, b) => sortTags(a.tags[0] ?? '', b.tags[0] ?? '')),
    pipes: pipeM, ducts, gvs, gvsM2, others: [...others.values()].sort((a, b) => b.n - a.n),
  };
}

/* ── the drawing: the option's markup as an SVG fragment in sheet units ─ */

/** The option drawn — blocks with their tags and labels, boxes with their numbers, runs with their metres — in a viewBox `0 0 1000 H`. `px` is sheet units per screen pixel of the target, for type and hairlines. */
export function optionMarkup(items: SketchItem[], shapes: SketchShape[], pipes: SketchPipe[], blocks: Map<string, CatalogBlock>, mPerW: number, tags: Map<string, string>, rules: PipeRules, px: number): string {
  const cm = suPerCm(mPerW);
  const out: string[] = ['<style>.bb * { vector-effect: non-scaling-stroke; }</style>'];
  const fs = 10 * px;
  for (const s of shapes) {
    const c = centroid(s.pts), n = boxNumbers(s.pts, mPerW);
    out.push(`<polygon points="${s.pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="${s.color}" fill-opacity="0.22" stroke="${s.color}" stroke-width="${1.5 * px}"/>`);
    out.push(`<text x="${c.x}" y="${c.y - fs * 0.2}" text-anchor="middle" font-size="${fs * 1.6}" font-weight="800" fill="${s.color}" stroke="#fff" stroke-width="${3 * px}" paint-order="stroke">${dropLabel(s.drop)}</text>`);
    out.push(`<text x="${c.x}" y="${c.y + fs * 1.1}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${NAVY}" stroke="#fff" stroke-width="${3 * px}" paint-order="stroke">${num1(n.m2)} m² · ${num1(n.runM)} m</text>`);
  }
  for (const p of pipes) {
    const look = pipeLook(p.kind, rules); const d = roundedPath(p.pts, 10 * px); const m = midpoint(p.pts);
    if (p.kind === 'duct') {
      const w = (p.widthCm ?? 20) * cm;
      out.push(`<path d="${d}" fill="none" stroke="${look.color}" stroke-opacity="0.3" stroke-width="${w}"/><path d="${d}" fill="none" stroke="${look.color}" stroke-width="${1.2 * px}" stroke-dasharray="${6 * px} ${4 * px}"/>`);
    } else if (look.pair) {
      out.push(`<path d="${d}" fill="none" stroke="${look.color}" stroke-width="${3.4 * px}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${1.2 * px}" stroke-linecap="round"/>`);
    } else {
      out.push(`<path d="${d}" fill="none" stroke="${look.color}" stroke-width="${2 * px}" stroke-linecap="round"${look.dash ? ` stroke-dasharray="${look.dash.split(/\s+/).map(v => Number(v) * px).join(' ')}"` : ''}/>`);
    }
    out.push(`<text x="${m.x + (m.horiz ? 0 : 4 * px)}" y="${m.y - (m.horiz ? 4 * px : 0)}" text-anchor="${m.horiz ? 'middle' : 'start'}" font-size="${fs}" font-weight="700" fill="${look.color}" stroke="#fff" stroke-width="${3 * px}" paint-order="stroke">${num1(pipeLength(p.pts, mPerW))} m${p.kind === 'duct' ? ` · Ø${p.widthCm ?? 20}` : ''}</text>`);
  }
  for (const it of items) {
    const b = blocks.get(it.blockId); const { w, h } = itemBox(it, mPerW);
    const [, , vw, vh] = (b?.vb ?? '0 0 1 1').split(/\s+/).map(Number);
    const body = !b ? `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="#fff" stroke="${NAVY}" stroke-dasharray="4 3"/>`
      : b.png ? `<image href="${b.png}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="none"/>`
        : `<g class="bb" transform="translate(${-w / 2} ${-h / 2}) scale(${w / (vw || 1)} ${h / (vh || 1)})">${b.body ?? ''}</g>`;
    const tag = tags.get(it.id);
    const lfs = 11 * px * it.labelScale;
    const dots = it.unit ? connectionDots({ w, h }, it.sub, it.cat).map(d => `<circle cx="${d.x}" cy="${d.y}" r="${(d.kind === 'outlet' ? 3.2 : 2.6) * px}" fill="${d.kind === 'outlet' ? '#0891b2' : ACCENT}" stroke="#fff" stroke-width="${px}"/>`).join('') : '';
    const tagSvg = tag ? `<rect x="${-lfs * 0.85 * Math.max(2, tag.length) / 2 - 2 * px}" y="${-lfs * 0.7}" width="${lfs * 0.85 * Math.max(2, tag.length) + 4 * px}" height="${lfs * 1.4}" rx="${3 * px}" fill="#fff" stroke="${NAVY}" stroke-width="${px}"/><text y="${lfs * 0.4}" text-anchor="middle" font-size="${lfs * 1.1}" font-weight="800" fill="${NAVY}">${tag}</text>` : '';
    out.push(`<g transform="translate(${it.x} ${it.y}) rotate(${it.rot})">${body}${dots}${tagSvg}</g>`);
    if (!it.labelHidden) {
      const label = blockLabel(it, tag);
      const dir = rot2(it.lx, it.ly, -it.rot);
      const tEdge = Math.min(Math.abs(dir.x) > 1e-6 ? (w / 2) / Math.abs(dir.x) : 1e9, Math.abs(dir.y) > 1e-6 ? (h / 2) / Math.abs(dir.y) : 1e9);
      const edge = tEdge < 1 ? rot2(dir.x * tEdge, dir.y * tEdge, it.rot) : { x: 0, y: 0 };
      out.push(`<line x1="${it.x + edge.x}" y1="${it.y + edge.y}" x2="${it.x + it.lx}" y2="${it.y + it.ly}" stroke="${NAVY}" stroke-width="${0.8 * px}"/>`);
      out.push(`<text x="${it.x + it.lx}" y="${it.y + it.ly}" font-size="${lfs}" font-weight="700" fill="${NAVY}" text-anchor="${it.lx < 0 ? 'end' : 'start'}" stroke="#fff" stroke-width="${3 * px}" paint-order="stroke" style="direction:${HEB.test(label) ? 'rtl' : 'ltr'};unicode-bidi:plaintext">${txt(label)}</text>`);
    }
  }
  return out.join('');
}

/* ── the sheet ─────────────────────────────────────────────────────────── */

export interface SheetInput {
  title: SheetTitle;
  /** The plan's pixels (the studio's canvases composited), as a data URL, and its aspect (h/w). */
  planImage: string;
  planAspect: number;
  markup: string;
  totals: OptionTotals;
  words?: { indoorUnit?: string; outdoorUnit?: string; number?: string };
}

/** Legend rows (SHEET-FORMAT §left): symbol, words, small print. */
const LEGEND: [string, string, string][] = [
  ['◉', 'נקודת ניקוז', 'H=30 מהתקרה'], ['⌓', 'שקע הזנה 1x10A', 'H=30 מהתקרה'], ['▭', 'פאקט', ''], ['▤', 'אוויר חוזר', ''],
  ['⊠', 'פתח שירות', ''], ['⊠', 'פתח שירות פלסטיק', ''], ['T', 'טרמוסטט', 'H=140 מהרצפה'], ['B', 'בקר ראשי + הזנה', 'H=140 מהרצפה'],
];

/** The whole sheet as SVG (`SHEET_W × SHEET_H` units). */
export function buildSheetSvg(inp: SheetInput): string {
  const { title: t, totals } = inp;
  const o: string[] = [];
  const W = SHEET_W, H = SHEET_H;
  const rtl = (x: number, y: number, s: string, size: number, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" direction="rtl" text-anchor="start" style="unicode-bidi:plaintext" ${extra}>${txt(s)}</text>`;
  const ltr = (x: number, y: number, s: string, size: number, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${txt(s)}</text>`;
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" fill="${INK}">`);
  o.push(`<rect width="${W}" height="${H}" fill="#fff"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#999"/>`);
  // ── left column: legend
  o.push(`<line x1="${LEFT_W}" y1="0" x2="${LEFT_W}" y2="${H}" stroke="${LINE}" stroke-width="1.5"/>`);
  let ly = 24;
  o.push(rtl(LEFT_W - 10, ly, 'מקרא:', 13, 'font-weight="700" text-decoration="underline"')); ly += 10;
  for (const [sym, words, small] of LEGEND) {
    o.push(`<line x1="0" y1="${ly}" x2="${LEFT_W}" y2="${ly}" stroke="${THIN}"/>`);
    o.push(`<rect x="8" y="${ly + 6}" width="22" height="16" fill="none" stroke="${INK}"/><text x="19" y="${ly + 18}" text-anchor="middle" font-size="9">${sym}</text>`);
    o.push(rtl(LEFT_W - 10, ly + 16, words, 10)); if (small) o.push(rtl(LEFT_W - 10, ly + 27, small, 8.5, `fill="${GREY}"`));
    ly += small ? 34 : 26;
  }
  o.push(`<line x1="0" y1="${ly}" x2="${LEFT_W}" y2="${ly}" stroke="${THIN}"/>`);
  o.push(rtl(LEFT_W - 10, H - 12, 'התמונות להמחשה בלבד', 9, `fill="${GREY}"`));
  // ── the drawing
  const dx0 = LEFT_W, dx1 = W - RIGHT_W, dw = dx1 - dx0;
  o.push(`<rect x="${dx0 + FRAME_PAD}" y="${FRAME_PAD}" width="${dw - 2 * FRAME_PAD}" height="${H - 2 * FRAME_PAD}" fill="none" stroke="#333" stroke-width="2"/>`);
  o.push(`<text x="${dx0 + dw / 2}" y="${H / 2 + 60}" text-anchor="middle" font-size="190" font-weight="800" fill="rgba(30,58,95,.07)" transform="rotate(-18 ${dx0 + dw / 2} ${H / 2})" letter-spacing="8">TzviAir</text>`);
  const cards = totals.units.length ? CARDS_H : 0;
  const ax = dx0 + FRAME_PAD + 12, ay = FRAME_PAD + 12, aw = dw - 2 * FRAME_PAD - 24, ah = H - 2 * FRAME_PAD - 24 - cards;
  const k = Math.min(aw / 1, ah / inp.planAspect);        // fit the plan (1 × aspect) into the area
  const pw = k, ph = k * inp.planAspect, px0 = ax + (aw - pw) / 2, py0 = ay + (ah - ph) / 2;
  o.push(`<image href="${inp.planImage}" x="${px0}" y="${py0}" width="${pw}" height="${ph}" preserveAspectRatio="none"/>`);
  o.push(`<svg x="${px0}" y="${py0}" width="${pw}" height="${ph}" viewBox="0 0 1000 ${1000 * inp.planAspect}" overflow="visible">${inp.markup}</svg>`);
  // the INDOOR UNIT cards (pick 50)
  if (totals.units.length) {
    const cw = 118, gap = 10, n = totals.units.length, total = n * cw + (n - 1) * gap;
    let cx = dx0 + dw / 2 - total / 2; const cy = H - FRAME_PAD - 8 - CARDS_H + 8;
    for (const u of totals.units) {
      const isOut = /outdoor|חיצוני|ELVOMV|PUMY|PUHY|Galaxy|Sun/i.test(u.name + ' ' + u.model);
      const head = isOut ? (inp.words?.outdoorUnit ?? 'OUTDOOR UNIT') : (inp.words?.indoorUnit ?? 'INDOOR UNIT');
      o.push(`<g data-unit-card="${esc(u.model)}"><rect x="${cx}" y="${cy}" width="${cw}" height="${CARDS_H - 10}" fill="#fff" stroke="${BLUE}" stroke-width="1.5"/>`);
      o.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="14" fill="#dcecf9" stroke="${BLUE}"/><text x="${cx + cw / 2}" y="${cy + 10.5}" text-anchor="middle" font-size="10" font-weight="700" fill="${BLUE}">${head}</text>`);
      const lines = [u.model, u.btu, u.cfm, u.dims, u.watts].filter(Boolean) as string[];
      lines.slice(0, 5).forEach((s, i) => o.push(`<text x="${cx + cw / 2}" y="${cy + 26 + i * 12}" text-anchor="middle" font-size="9.5" fill="${BLUE}" style="unicode-bidi:plaintext">${txt(s)}</text>`));
      const ny = cy + CARDS_H - 10 - 28;
      o.push(`<rect x="${cx}" y="${ny}" width="${cw}" height="12" fill="#dcecf9" stroke="${BLUE}"/><text x="${cx + cw / 2}" y="${ny + 9.5}" text-anchor="middle" font-size="9" font-weight="700" fill="${BLUE}">${inp.words?.number ?? 'Number:'}</text>`);
      const chips = u.tags.length ? u.tags : [`×${u.n}`];
      const chipW = 22, cgap = 3, ctotal = Math.min(chips.length, 5) * chipW + (Math.min(chips.length, 5) - 1) * cgap;
      let chx = cx + cw / 2 - ctotal / 2;
      for (const c of chips.slice(0, 5)) { o.push(`<rect x="${chx}" y="${ny + 15}" width="${chipW}" height="11" fill="#fff" stroke="${BLUE}"/><text x="${chx + chipW / 2}" y="${ny + 23.5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${BLUE}">${txt(c)}</text>`); chx += chipW + cgap; }
      if (chips.length > 5) o.push(`<text x="${chx + 2}" y="${ny + 23.5}" font-size="8.5" fill="${BLUE}">+${chips.length - 5}</text>`);
      o.push('</g>');
      cx += cw + gap;
    }
  }
  // ── right column: the title block
  const rx = dx1, rw = RIGHT_W;
  o.push(`<line x1="${rx}" y1="0" x2="${rx}" y2="${H}" stroke="${LINE}" stroke-width="1.5"/>`);
  let y = 0;
  const row = (h: number, draw: (y0: number) => void) => { draw(y); y += h; o.push(`<line x1="${rx}" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}"/>`); };
  const lab = (y0: number, s: string, isRtl = false) => isRtl ? rtl(W - 10, y0 + 13, s, 11.5, `fill="${GREY}"`) : ltr(rx + 10, y0 + 13, s, 11.5, `fill="${GREY}"`);
  row(58, y0 => { o.push(lab(y0, 'Family Name:')); o.push(`<text x="${rx + 10}" y="${y0 + 50}" font-size="${t.family.length > 12 ? 24 : 34}" letter-spacing=".5" style="unicode-bidi:plaintext" data-title-family="1">${txt(t.family)}</text>`); });
  row(38, y0 => { o.push(lab(y0, 'Contact Info:')); o.push(ltr(rx + 10, y0 + 32, t.phone, 16, 'data-title-phone="1"')); });
  row(38, y0 => { o.push(lab(y0, 'Address:')); o.push(rtl(W - 10, y0 + 32, t.address, 16, 'data-title-address="1"')); });
  row(36, y0 => { o.push(lab(y0, 'Floor:')); o.push(ltr(rx + 10, y0 + 31, t.floor, 16, 'style="unicode-bidi:plaintext"')); });
  row(36, y0 => { o.push(lab(y0, 'Project Name/ City:')); o.push(ltr(rx + 10, y0 + 31, t.project, 15, 'style="unicode-bidi:plaintext"')); });
  row(44, y0 => { o.push(lab(y0, 'סוג תוכנית:', true)); o.push(rtl(W - 10, y0 + 37, t.planType, 22, 'font-weight="700"')); });
  row(34, y0 => { o.push(lab(y0, 'שרטוט:', true)); o.push(rtl(W - 10, y0 + 29, t.drawnBy, 14)); });
  row(34, y0 => { o.push(lab(y0, 'תאריך:', true)); o.push(ltr(rx + 10, y0 + 29, t.date, 15)); });
  row(34, y0 => { o.push(lab(y0, 'גירסה:', true)); o.push(ltr(rx + 10, y0 + 29, `v${t.version}${t.optionName ? ` · ${t.optionName}` : ''}${t.sheetNo ? ` · ${t.sheetNo.i}/${t.sheetNo.n}` : ''}`, 15, 'style="unicode-bidi:plaintext"')); });
  const cb = (x: number, y0: number) => `<rect x="${x}" y="${y0}" width="13" height="13" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
  row(26, y0 => { o.push(ltr(rx + 10, y0 + 18, 'Penthouse:', 11.5, `fill="${GREY}"`)); o.push(ltr(rx + 82, y0 + 18, 'yes', 11)); o.push(cb(rx + 104, y0 + 7)); o.push(ltr(rx + 124, y0 + 18, 'no', 11)); o.push(cb(rx + 142, y0 + 7)); });
  row(26, y0 => { o.push(rtl(W - 10, y0 + 18, 'קבלן פרטי:', 11.5, `fill="${GREY}"`)); o.push(rtl(W - 80, y0 + 18, 'כ', 11)); o.push(cb(W - 104, y0 + 7)); o.push(rtl(W - 118, y0 + 18, 'פ', 11)); o.push(cb(W - 142, y0 + 7)); });
  row(44, y0 => { o.push(cb(rx + 10, y0 + 8)); o.push(ltr(rx + 28, y0 + 19, 'Proposal / לעיון', 11, 'style="unicode-bidi:plaintext"')); o.push(cb(rx + 10, y0 + 27)); o.push(ltr(rx + 28, y0 + 38, 'Approved / לביצוע', 11, 'style="unicode-bidi:plaintext"')); });
  const wrap = (s: string, per: number) => { const words = s.split(' '); const lines: string[] = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).trim().length > per) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; } if (cur.trim()) lines.push(cur.trim()); return lines; };
  const rightsEn = wrap('All rights reserved to the designer. Do not determine sizes by measuring the plan. The installer/contractor must check the entire plan before the installation, and let the designer know of any mistake or discrepancy.', 44);
  const rightsHe = wrap('כל הזכויות שמורות למתכנן. אין לקבוע גדלים לפי מדידה בתכנית. על המבצע לבדוק את כל התכניות לפני הביצוע ולהודיע למתכנן על כל טעות או אי התאמה.', 40);
  row(rightsEn.length * 11 + 10, y0 => rightsEn.forEach((l, i) => o.push(ltr(rx + 10, y0 + 12 + i * 11, l, 8.7, 'fill="#333"'))));
  row(rightsHe.length * 11 + 10, y0 => rightsHe.forEach((l, i) => o.push(rtl(W - 10, y0 + 12 + i * 11, l, 8.7, 'fill="#333"'))));
  row(22 + DROPS.length * 18 + 6, y0 => {
    o.push(rtl(W - 10, y0 + 15, 'גובה הנמכה:', 11.5, `fill="${GREY}" font-weight="700"`));
    DROPS.forEach((d, i) => { const yy = y0 + 22 + i * 18; o.push(`<rect x="${rx + 10}" y="${yy}" width="44" height="13" fill="${KEY_FILL[d.drop] ?? d.color}" stroke="#999"/>`); o.push(ltr(rx + 62, yy + 11, dropLabel(d.drop), 11)); const g = totals.gvs[d.drop]; if (g) o.push(rtl(W - 10, yy + 11, `${num1(g.m2)} מ"ר`, 10, `fill="${GREY}"`)); });
  });
  row(30, y0 => { o.push(rtl(W - 10, y0 + 21, `חישוב גבס: ${num1(totals.gvsM2)} מ"ר`, 14, 'font-weight="700" data-gvs-total="1"')); });
  // the runs' metres, by kind
  const runRows = [...Object.entries(totals.pipes).map(([k, m]) => [k, m] as [string, number]), ...Object.entries(totals.ducts).map(([w, m]) => [`duct Ø${w}`, m] as [string, number])].filter(([, m]) => m > 0);
  if (runRows.length) row(14 + runRows.length * 13, y0 => runRows.forEach(([k, m], i) => o.push(ltr(rx + 10, y0 + 12 + i * 13, `${k}: ${num1(m)} m`, 10.5))));
  const brandY = H - 84;
  const offices = ['Beit Shemesh|02-628-8282|9 Nachal Kidron RBSA', 'Tel Aviv|03-720-8000|Azrielli Sarona Tower|121 Derech Menachem Begin'];
  let oy = Math.max(y + 6, brandY - 118);
  for (const off of offices) { const ls = off.split('|'); ls.forEach((l, i) => o.push(`<text x="${rx + rw / 2}" y="${oy + 13 + i * 13}" text-anchor="middle" font-size="${i === 0 ? 14 : 11}" font-weight="${i === 0 ? 700 : 400}">${txt(l)}</text>`)); oy += ls.length * 13 + 8; }
  o.push(`<text x="${rx + rw / 2}" y="${brandY + 30}" text-anchor="middle" font-size="30" font-weight="800" fill="${NAVY}">Tzvi<tspan fill="${ACCENT}">Air</tspan></text>`);
  o.push(`<text x="${rx + rw / 2}" y="${brandY + 48}" text-anchor="middle" font-size="14" font-weight="700" letter-spacing=".5">Air Conditioning</text>`);
  o.push(`<text x="${rx + rw / 2}" y="${brandY + 61}" text-anchor="middle" font-size="9.5" fill="${GREY}">Engineering, Design and Installation</text>`);
  o.push(`<text x="${rx + rw / 2}" y="${brandY + 74}" text-anchor="middle" font-size="9.5" fill="${GREY}" style="unicode-bidi:plaintext">תכנון התקנה ושירות מערכות מיזוג אוויר</text>`);
  o.push('</svg>');
  return o.join('');
}

/* ── the Excel (picks 30 · 71) ─────────────────────────────────────────── */

const KIND_WORD: Record<string, string> = { refrigerant: 'Refrigerant pair', drain: 'Drain', electric: 'Electrical feed', duct: 'Flex duct' };

/** One row per option per item; a Totals sheet across options. */
export function boqSheets(options: { name: string; totals: OptionTotals }[], meta: { family: string; floor: string; date: string; version: number }): Sheet[] {
  const rows: (string | number)[][] = [['Option', 'Kind', 'Item', 'Model', 'Brand', 'Letters', 'Quantity', 'Unit', 'Capacity', 'Notes']];
  const keyed = new Map<string, { item: string; unit: string; per: Record<string, number> }>();
  const add = (opt: string, kind: string, item: string, model: string, brand: string, letters: string, qty: number, unit: string, cap = '', notes = '') => {
    rows.push([opt, kind, item, model, brand, letters, +qty.toFixed(2), unit, cap, notes]);
    const k = `${kind}|${model || item}|${unit}`; const r = keyed.get(k) ?? { item: `${kind} · ${model || item}`, unit, per: {} }; r.per[opt] = (r.per[opt] ?? 0) + qty; keyed.set(k, r);
  };
  for (const { name, totals } of options) {
    for (const u of totals.units) add(name, 'Unit', u.name, u.model, u.brand, u.tags.join(' '), u.n, 'pcs', u.btu ?? '', [u.cfm, u.dims, u.watts].filter(Boolean).join(' · '));
    for (const o of totals.others) add(name, 'Block', o.name, o.model, o.brand, '', o.n, 'pcs');
    for (const [k, m] of Object.entries(totals.pipes)) if (m) add(name, 'Pipe', KIND_WORD[k] ?? k, '', '', '', m, 'm');
    for (const [w, m] of Object.entries(totals.ducts)) if (m) add(name, 'Duct', `Flex duct Ø${w}`, `Ø${w}`, '', '', m, 'm');
    for (const [d, g] of Object.entries(totals.gvs)) add(name, 'Gvs', `Lowered ceiling −${d}`, `−${d}`, '', '', g.m2, 'm²', '', `running ${g.runM.toFixed(2)} m`);
  }
  const names = options.map(o => o.name);
  const totalsRows: (string | number)[][] = [['Item', 'Unit', ...names]];
  for (const r of keyed.values()) totalsRows.push([r.item, r.unit, ...names.map(n => +(r.per[n] ?? 0).toFixed(2))]);
  const about: (string | number)[][] = [['Family', meta.family], ['Floor', meta.floor], ['Date', meta.date], ['Version', `v${meta.version}`], ['Options', names.join(', ')]];
  return [
    { name: 'Rows', rows, header: true, widths: [14, 8, 34, 18, 12, 16, 10, 6, 14, 30] },
    { name: 'Totals', rows: totalsRows, header: true, widths: [40, 6, ...names.map(() => 14)] },
    { name: 'About', rows: about, widths: [12, 40] },
  ];
}

/** File names (pick 70): `Family – Floor – Option – vN`, or a typed name in its place. */
export function exportNames(inp: { family: string; floor: string; version: number; typed?: string; optionNames: string[]; onePdf: boolean }): { pdfs: string[]; xlsx: string } {
  const base = inp.typed?.trim() || [inp.family, inp.floor].filter(Boolean).join(' – ') || 'Plan';
  const v = `v${inp.version}`;
  const pdfs = inp.onePdf
    ? [inp.typed?.trim() ? `${base}.pdf` : `${base} – options – ${v}.pdf`]
    : inp.optionNames.map(n => (inp.typed?.trim() ? `${base} – ${n}.pdf` : `${base} – ${n} – ${v}.pdf`));
  return { pdfs, xlsx: inp.typed?.trim() ? `${base} – units & BOQ.xlsx` : `${base} – units & BOQ – ${v}.xlsx` };
}

export const todayDDMMYYYY = (d = new Date()) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
