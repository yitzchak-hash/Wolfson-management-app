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

export interface SheetFetchOk {
  ok: true;
  title: string;
  tab: string;
  tabs: string[];
  rows: unknown[][];
  fetchedAt: string;
}
export interface SheetFetchErr { ok: false; error: string }
export type SheetFetchResult = SheetFetchOk | SheetFetchErr;

export function isSheetBackendConfigured(): boolean {
  return !!DRIVE_API_KEY;
}

export async function fetchContractorSheet(sheetUrl: string, tab?: string): Promise<SheetFetchResult> {
  if (!sheetUrl?.trim()) return { ok: false, error: 'No sheet link set for this workspace.' };
  if (!DRIVE_API_KEY) return { ok: false, error: 'VITE_DRIVE_API_KEY is not configured.' };
  try {
    const resp = await fetch('/api/sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
      body: JSON.stringify({ sheetUrl: sheetUrl.trim(), tab }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: data.error ?? `Sheet request failed (${resp.status})` };
    return {
      ok: true,
      title: data.title ?? '',
      tab: data.tab ?? '',
      tabs: data.tabs ?? [],
      rows: data.rows ?? [],
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
function findBlocks(rows: unknown[][], headerRowIdx: number): Block[] {
  const header = (rows[headerRowIdx] ?? []).map(c => String(c ?? '').trim());
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
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if ((rows[i] ?? []).some(c => String(c ?? '').trim() === HEADER_APARTMENT)) return i;
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
export function parseSheet(rows: unknown[][], blockIndex: number): SheetApartmentStatus[] {
  if (!rows.length) return [];
  const headerRowIdx = findHeaderRow(rows);
  const blocks = findBlocks(rows, headerRowIdx);
  const block = blocks[blockIndex];
  if (!block) return [];

  const byApt = new Map<string, SheetApartmentStatus>();

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const label = String(row[block.labelCol] ?? '').trim();
    if (!label) continue;
    const num = apartmentNumberFromLabel(label);
    if (!num) continue;

    const existing = byApt.get(num);
    const categories: SheetCategory[] = block.categories.map(({ name, col }) => ({
      name,
      percent: normalisePercent(row[col]),
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
export function countBlocks(rows: unknown[][]): number {
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
