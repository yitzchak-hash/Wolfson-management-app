// Reads the contractor's shared status spreadsheet through /api/sheet.
//
// The sheet is laid out as two side-by-side building blocks, e.g.
//
//   A        B              C        D       …          K        L        M      …
//   ┌──────────── בניין 1 ────────────┐      │          ┌──────────── בניין 2 ────────┐
//   קומה     דירה           בלוקים   חשמל   …          קומה     דירה     בלוקים  …
//   קרקע     דירה ספריה     100%     70%    …          קרקע     דירה 1   100%    …
//            דירה 2 קומה 0  100%     60%    …                   …
//
// Row 1 holds the building banners, row 2 the category headers, and every row
// after that is one apartment (or one half of a duplex). We locate each block by
// its "דירה" header rather than by fixed column letters, so inserting a column
// does not break the mapping.

const DRIVE_API_KEY = import.meta.env.VITE_DRIVE_API_KEY ?? '';

export interface SheetCategory {
  name: string;
  /** 0–100, or null when the contractor has not filled the cell in. */
  percent: number | null;
}

export interface SheetApartmentStatus {
  apartmentNumber: string;
  categories: SheetCategory[];
  /** Raw label from the sheet, e.g. "דירה 2 קומה 0" */
  rawLabel: string;
}

export interface SheetCell { v: string; bg: string | null }

/** A null cell means empty AND unfilled; the slot is kept for column alignment. */
export type SheetRow = (SheetCell | null)[];
export interface SheetTab { name: string; rows: SheetRow[] }

export interface SheetFetchOk {
  ok: true;
  title: string;
  kind: 'google-sheet' | 'xlsx';
  tab: string;
  tabs: string[];
  rows: SheetRow[];
  /** Every worksheet. The Wolfson workbook keeps one trade per tab. */
  sheets: SheetTab[];
  fetchedAt: string;
}
export interface SheetFetchErr { ok: false; error: string }
export type SheetFetchResult = SheetFetchOk | SheetFetchErr;

export function isSheetBackendConfigured(): boolean {
  return !!DRIVE_API_KEY;
}

/** The tab a Sheets URL points at, e.g. "…#gid=1630010640". */
export function gidFromUrl(url: string): string | null {
  const m = String(url ?? '').match(/[#&?]gid=(\d+)/);
  return m ? m[1] : null;
}

export async function fetchContractorSheet(sheetUrl: string, tab?: string): Promise<SheetFetchResult> {
  if (!sheetUrl?.trim()) return { ok: false, error: 'No sheet link set for this workspace.' };
  if (!DRIVE_API_KEY) return { ok: false, error: 'VITE_DRIVE_API_KEY is not configured.' };
  try {
    const resp = await fetch('/api/sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
      body: JSON.stringify({ sheetUrl: sheetUrl.trim(), tab, gid: gidFromUrl(sheetUrl) }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: data.error ?? `Sheet request failed (${resp.status})` };
    return {
      ok: true,
      title: data.title ?? '',
      kind: data.kind ?? 'google-sheet',
      tab: data.tab ?? '',
      tabs: data.tabs ?? [],
      rows: (data.rows ?? []) as SheetRow[],
      sheets: (data.sheets ?? [{ name: data.tab ?? '', rows: data.rows ?? [] }]) as SheetTab[],
      fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** "60%" | "60" | 0.6 | 60 → 60. Blank / non-numeric → null (renders grey). */
export function normalisePercent(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    // Sheets returns a percent-formatted cell as a fraction under UNFORMATTED_VALUE
    const pct = raw > 0 && raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (!Number.isFinite(n)) return null;
  if (!s.includes('%') && n > 0 && n <= 1) n *= 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Pulls the apartment number out of a Hebrew row label like "דירה 2 קומה 0". */
export function apartmentNumberFromLabel(label: string): string | null {
  if (!label) return null;
  const s = String(label).trim();
  // "דירה 12" / "דירה 2 קומה 0" — the FIRST number is the apartment
  const m = s.match(/דירה\s*(\d+)/);
  if (m) return m[1];
  const bare = s.match(/^\s*(\d+)\s*$/);
  return bare ? bare[1] : null;
}

const HEADER_APARTMENT = 'דירה';
const HEADER_FLOOR = 'קומה';

interface Block { labelCol: number; categories: { name: string; col: number }[] }

/**
 * Finds each building block by locating the "דירה" header cells on the header row,
 * then treating every following column up to the next block as a category.
 */
function findBlocks(rows: SheetRow[], headerRowIdx: number): Block[] {
  const header = (rows[headerRowIdx] ?? []).map(c => String(c?.v ?? '').trim());
  const labelCols: number[] = [];
  header.forEach((c, i) => { if (c === HEADER_APARTMENT) labelCols.push(i); });

  return labelCols.map((labelCol, bi) => {
    const end = bi + 1 < labelCols.length ? labelCols[bi + 1] : header.length;
    const categories: { name: string; col: number }[] = [];
    for (let col = labelCol + 1; col < end; col++) {
      const name = header[col];
      if (!name || name === HEADER_FLOOR || name === HEADER_APARTMENT) continue;
      categories.push({ name, col });
    }
    return { labelCol, categories };
  });
}

/** Locates the row carrying the category headers (the one containing "דירה"). */
function findHeaderRow(rows: SheetRow[]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if ((rows[i] ?? []).some(c => String(c?.v ?? '').trim() === HEADER_APARTMENT)) return i;
  }
  return 1;
}

/**
 * Parses the sheet into per-apartment status, for one building block.
 * `blockIndex` 0 is the left-most building in the sheet.
 *
 * A duplex occupies two rows ("דירה 2 קומה 0" and "דירה 2 קומה 1"); both carry the
 * same apartment number, so their values are merged and the higher of the two wins
 * for any category present on both.
 */
export function parseSheet(rows: SheetRow[], blockIndex: number): SheetApartmentStatus[] {
  if (!rows.length) return [];
  const headerRowIdx = findHeaderRow(rows);
  const blocks = findBlocks(rows, headerRowIdx);
  const block = blocks[blockIndex];
  if (!block) return [];

  const byApt = new Map<string, SheetApartmentStatus>();

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const label = String(row[block.labelCol]?.v ?? '').trim();
    if (!label) continue;
    const num = apartmentNumberFromLabel(label);
    if (!num) continue;

    const existing = byApt.get(num);
    const categories: SheetCategory[] = block.categories.map(({ name, col }) => ({
      name,
      percent: normalisePercent(row[col]?.v),
    }));

    if (!existing) {
      byApt.set(num, { apartmentNumber: num, categories, rawLabel: label });
    } else {
      // Merge the second half of a duplex — keep the higher recorded value
      existing.categories = existing.categories.map((c, i) => {
        const other = categories[i];
        if (!other || other.percent === null) return c;
        if (c.percent === null) return other;
        return c.percent >= other.percent ? c : other;
      });
    }
  }

  return Array.from(byApt.values());
}

/** Number of building blocks the sheet contains. */
export function countBlocks(rows: SheetRow[]): number {
  if (!rows.length) return 0;
  return findBlocks(rows, findHeaderRow(rows)).length;
}

/** 0% grey, then dark red → orange → green, matching the agreed colour scale. */
const STOPS: [number, [number, number, number]][] = [
  [1, [139, 26, 26]], [25, [185, 28, 28]], [50, [234, 88, 12]],
  [65, [245, 158, 11]], [80, [234, 179, 8]], [92, [132, 204, 22]], [100, [22, 163, 74]],
];
export function percentColor(p: number | null): string {
  if (p === null || p <= 0) return '#9ca3af';
  if (p <= STOPS[0][0]) return `rgb(${STOPS[0][1].join(',')})`;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (p <= b) {
      const t = (p - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * t)).join(',')})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`;
}

// ─── Wolfson-style workbook (floor-plan diagram, colour coded) ───────────────
//
// Nothing like the Netiv sheet. Each TAB is one trade ("חשמל", "טיח", "ריצוף",
// …) and every tab holds the same floor-plan diagram repeated for A1, A2 and A3
// side by side. There are no percentages: an apartment is DONE when its cell is
// filled green and IN PROGRESS when filled yellow.
//
// Real structure, verified against the workbook:
//
//   row 1        legend swatch in column 1 (skip)
//   row 3/4      building banners — "A1" spanning cols 3-9, "A2" 18-24, "A3" 34-40
//   row 11       floor label, e.g. "17 - 06/07/2026", in column 1 (and 7 for the
//                second wing); coloured when that whole floor is done for the trade
//   rows 12-14   the apartments on that floor, each a MERGED rectangle
//                (apt 56 covers cols 2-5, apt 55 covers cols 7-12)
//
// Two consequences drive the implementation:
//   * Apartment cells are merged, so a number repeats across its whole span.
//     Counting occurrences to identify the building is therefore wrong; the
//     building must come from COLUMN RANGES derived from the A1/A2/A3 banners.
//   * A row is a floor label when column 1 carries TEXT. Apartment rows never do.
//     That resolves the collision between floor "14" and apartment "14".

export type CellState = 'done' | 'progress' | 'issue' | 'none';

export interface WolfsonCategoryStatus {
  name: string;
  state: CellState;
  /** Anything the contractor typed in the cell beyond the apartment number. */
  note?: string;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

/**
 * Classifies a fill colour. The workbook uses 00B050 and 00FF00 for done,
 * FFFF00 for in progress, and greys on the "unsold" tab which carry no progress
 * meaning and must read as nothing.
 */
export function classifyFill(bg: string | null): CellState {
  if (!bg) return 'none';
  const rgb = hexToRgb(bg);
  if (!rgb) return 'none';
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const light = (max + min) / 2 / 255;
  const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
  if (sat < 0.15 || light > 0.94 || light < 0.06) return 'none'; // white / grey / black
  let hue: number;
  if (max === min) hue = 0;
  else if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue >= 75 && hue <= 175) return 'done';      // green
  if (hue >= 25 && hue < 75) return 'progress';    // yellow / amber
  if (hue < 25 || hue >= 330) return 'issue';      // red
  return 'none';
}

export const STATE_COLORS: Record<CellState, string> = {
  done: '#16a34a', progress: '#f59e0b', issue: '#dc2626', none: '#9ca3af',
};

/** Every apartment number a cell refers to — handles merged labels like "19+18". */
function aptNumbersInCell(text: string): string[] {
  const s = text.trim();
  if (!s) return [];
  const pair = s.match(/^(\d+)\s*\+\s*(\d+)/);
  if (pair) return [pair[1], pair[2]];
  const one = s.match(/^(\d+)/);
  return one ? [one[1]] : [];
}

interface BuildingSpans { rowIdx: number; spans: { id: string; min: number; max: number }[] }

/** Locates the row carrying the "A1"/"A2"/"A3" banners and each banner's span. */
function findBuildingRow(rows: SheetRow[]): BuildingSpans | null {
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const row = rows[r] ?? [];
    const byId = new Map<string, { min: number; max: number }>();
    row.forEach((c, i) => {
      const v = String(c?.v ?? '').trim().toUpperCase();
      if (!/^A\d$/.test(v)) return;
      const cur = byId.get(v);
      if (!cur) byId.set(v, { min: i, max: i });
      else cur.max = i;
    });
    if (byId.size >= 2) {
      const spans = [...byId.entries()]
        .map(([id, s]) => ({ id, ...s }))
        .sort((a, b) => a.min - b.min);
      return { rowIdx: r, spans };
    }
  }
  return null;
}

/** Column range [start, end) owned by a building, split midway between banners. */
function columnRange(info: BuildingSpans, buildingId: string): [number, number] | null {
  const idx = info.spans.findIndex(s => s.id === buildingId.trim().toUpperCase());
  if (idx < 0) return null;
  const prev = info.spans[idx - 1];
  const next = info.spans[idx + 1];
  const start = prev ? Math.ceil((prev.max + info.spans[idx].min) / 2) : 0;
  const end = next ? Math.ceil((info.spans[idx].max + next.min) / 2) : Number.MAX_SAFE_INTEGER;
  return [start, end];
}

/** True when this row is a floor label rather than a row of apartments. */
function isFloorRow(row: SheetRow): boolean {
  return !!String(row?.[0]?.v ?? '').trim();
}

/**
 * Reads one trade tab and returns the state of a single apartment.
 *
 * When the apartment's own cell carries no fill, the enclosing floor label is
 * used instead — the structural tabs ("שלד + מחיצות") colour the floor rather
 * than each apartment, and a green floor genuinely means every unit on it is done.
 */
export function parseWolfsonTab(
  rows: SheetRow[],
  buildingId: string,
  apartmentNumber: string,
): { state: CellState; note?: string } | null {
  const target = apartmentNumber.trim();
  if (!target || !rows?.length) return null;
  const info = findBuildingRow(rows);
  if (!info) return null;
  const range = columnRange(info, buildingId);
  if (!range) return null;
  const [start, end] = range;

  // Nearest floor-label cell at or left of a column, so a split-wing floor
  // (labels in both column 1 and column 7) attributes to the right wing.
  let floorMarks: { col: number; bg: string | null }[] = [];

  for (let r = info.rowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!row.length) continue;

    if (isFloorRow(row)) {
      floorMarks = [];
      for (let c = start; c < Math.min(end, row.length); c++) {
        if (String(row[c]?.v ?? '').trim()) floorMarks.push({ col: c, bg: row[c]?.bg ?? null });
      }
      continue;
    }

    for (let c = start; c < Math.min(end, row.length); c++) {
      const cell = row[c];
      const text = String(cell?.v ?? '');
      if (!aptNumbersInCell(text).includes(target)) continue;

      const note = text.trim().replace(/^\d+(\s*\+\s*\d+)?\s*/, '').replace(/\s+/g, ' ').trim();
      let bg = cell?.bg ?? null;
      if (!bg) {
        // Fall back to the floor this apartment sits on
        const wing = [...floorMarks].reverse().find(f => f.col <= c) ?? floorMarks[0];
        bg = wing?.bg ?? null;
      }
      return { state: classifyFill(bg), note: note || undefined };
    }
  }
  return null;
}

/**
 * Tabs that are not trades and must not appear as progress rows:
 * "דירות לא מכורות" records sold/unsold with greys, and "מאסטר" is a summary
 * sheet holding only the legend.
 */
const NON_TRADE_TABS = new Set(['דירות לא מכורות', 'מאסטר']);

/** True when the workbook uses the Wolfson floor-plan layout. */
export function isWolfsonLayout(rows: SheetRow[]): boolean {
  if (findBuildingRow(rows)) return true;
  const hasNetivHeader = rows.slice(0, 12)
    .some(r => (r ?? []).some(c => String(c?.v ?? '').trim() === HEADER_APARTMENT));
  return !hasNetivHeader;
}

/**
 * One row per trade for an apartment, merged across every tab in the workbook.
 * The category name is the TAB name, which is where this workbook records the
 * trade. Tabs that are not trades, or that do not contain the building, are
 * skipped rather than shown as empty rows.
 */
export function parseWolfsonAllTabs(
  sheets: SheetTab[],
  buildingId: string,
  apartmentNumber: string,
): WolfsonCategoryStatus[] {
  const out: WolfsonCategoryStatus[] = [];
  for (const sheet of sheets ?? []) {
    const name = (sheet?.name ?? '').trim();
    if (!name || NON_TRADE_TABS.has(name)) continue;
    const hit = parseWolfsonTab(sheet.rows, buildingId, apartmentNumber);
    if (!hit) continue;
    out.push({ name, state: hit.state, note: hit.note });
  }
  return out;
}
