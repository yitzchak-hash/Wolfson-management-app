/**
 * The block catalog (B7, picks 17 · 20 · 21 · 22 · 47).
 *
 * The architects' master DWG IS the catalog (pick 20): `public/catalog.json`
 * is built from it by `scratchpad/buildcatalog.mjs` — one entry per block with
 * its name, model, brand, category, TRUE size in cm and its drawing as an SVG
 * body in block units (1 cm = 4 units, the DXF's own). Nothing here invents a
 * block; this module only loads, sorts, searches and describes them.
 *
 * Custom blocks (the PNG door, pick 21) live in Firestore `sketcher_blocks`
 * and are merged in by `useCatalog()`; the block-rules page's overrides
 * (`sketcher_settings/blockRules`) rename, re-shelve, hide and order them —
 * pick 47's "edited from the admin app" is that document, which the workspace
 * app can write to as well.
 */

export type BlockCat = 'indoor' | 'outdoor' | 'grilles' | 'diffusers' | 'hatches' | 'accessories' | 'cards' | 'other' | 'custom';

/** The shelves, in the order they hang (pick 17). `cards` are the sheet's INDOOR UNIT cards — pick 50, B9 — and stay off the shelf until then. */
export const CAT_ORDER: BlockCat[] = ['indoor', 'outdoor', 'grilles', 'diffusers', 'hatches', 'accessories', 'custom', 'other', 'cards'];
export const SHELF_CATS: BlockCat[] = CAT_ORDER.filter(c => c !== 'cards');

export interface CatalogBlock {
  id: string;
  name: string;
  model: string;
  brand: string;
  cat: BlockCat;
  sub: string;
  /** True size, centimetres — what pick 19's padlock holds. */
  wCm: number;
  hCm: number;
  /** An air-conditioning UNIT (indoor or outdoor): it gets a system letter and connection dots. */
  unit: boolean;
  /** A grille: pulled along its LENGTH only, snapping to `lengths` (picks 19 · 51). */
  stretch: boolean;
  lengths?: number[];
  /** The block's own words off the drawing — capacity, airflow, dimensions. */
  specs: string[];
  /** SVG viewBox and body, in block units (4 per cm). A PNG block has `png` instead. */
  vb: string;
  body?: string;
  png?: string;
  custom?: boolean;
}

export interface BlockRule { name?: string; cat?: BlockCat; hidden?: boolean; order?: number; /** the lowered ceiling this unit needs, cm (pick 24 · 61) */ minDrop?: number }

/** The drop a unit needs by what it is, until the rules page says otherwise (pick 24): hidden units 30, medium-pressure 35, the mini-central 40; wall and vertical units none. */
export function defaultMinDrop(sub?: string, cat?: string): number {
  if (cat !== 'indoor') return 0;
  const s = sub ?? '';
  if (/mini/.test(s)) return 40;
  if (/medium/.test(s)) return 35;
  if (/hidden/.test(s)) return 30;
  return 0;
}
export type BlockRules = Record<string, BlockRule>;

interface CatalogFile { generated: string; source: string; blocks: CatalogBlock[] }

let loading: Promise<CatalogBlock[]> | null = null;
/** The fixed catalog, fetched once per session from the bundle's own `/catalog.json`. */
export function loadCatalog(): Promise<CatalogBlock[]> {
  if (!loading) {
    loading = fetch('/catalog.json').then(r => {
      if (!r.ok) throw new Error(`catalog ${r.status}`);
      return r.json() as Promise<CatalogFile>;
    }).then(f => f.blocks).catch(err => { loading = null; throw err; });
  }
  return loading;
}

/** Apply the rules page's overrides and drop the hidden ones. */
export function applyRules(blocks: CatalogBlock[], rules: BlockRules | null | undefined): CatalogBlock[] {
  if (!rules) return blocks;
  return blocks
    .filter(b => !rules[b.id]?.hidden)
    .map(b => {
      const r = rules[b.id];
      if (!r) return b;
      return { ...b, name: r.name?.trim() || b.name, cat: r.cat ?? b.cat };
    });
}

/** Shelf order: category, then the rule's order, then brand, then name. */
export function sortBlocks(blocks: CatalogBlock[], rules?: BlockRules | null): CatalogBlock[] {
  const ord = (b: CatalogBlock) => rules?.[b.id]?.order ?? 1000;
  return [...blocks].sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || ord(a) - ord(b) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
}

/** Every brand on the shelf, the blank one last as "no brand". */
export function brandsOf(blocks: CatalogBlock[]): string[] {
  const set = new Set(blocks.map(b => b.brand));
  return [...set].filter(Boolean).sort().concat(set.has('') ? [''] : []);
}

/** Search by name, model, brand and the block's own specs — accent/case-blind, every word must hit. */
export function searchBlocks(blocks: CatalogBlock[], q: string): CatalogBlock[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return blocks;
  return blocks.filter(b => {
    const hay = `${b.name} ${b.model} ${b.brand} ${b.sub} ${b.specs.join(' ')}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/** The words a label carries (pick 44): the block's own, never typed on the sheet (pick 49). */
export function blockLabel(b: Pick<CatalogBlock, 'name' | 'model'>, unitTag?: string): string {
  const parts = [unitTag, b.model && !b.name.includes(b.model) ? b.model : ''].filter(Boolean);
  return parts.length ? `${parts.join(' ')} · ${b.name}` : b.name;
}

/** A size in words: "110 × 56 cm". */
export const sizeLabel = (wCm: number, hCm: number): string => `${tidy(wCm)} × ${tidy(hCm)} cm`;
const tidy = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1));

/** The nearest catalog length (cm) to a pulled grille (pick 51); `null` when the block has none. */
export function snapLength(b: Pick<CatalogBlock, 'lengths'>, cm: number): number | null {
  if (!b.lengths?.length) return null;
  let best = b.lengths[0];
  for (const l of b.lengths) if (Math.abs(l - cm) < Math.abs(best - cm)) best = l;
  return best;
}

/** A PNG block's drawing, as the same `vb`/body pair the SVG blocks have. */
export function pngBlock(input: { id: string; name: string; model?: string; brand?: string; cat: BlockCat; wCm: number; hCm: number; png: string; unit?: boolean }): CatalogBlock {
  return {
    id: input.id, name: input.name, model: input.model ?? '', brand: input.brand ?? '', cat: input.cat, sub: 'png',
    wCm: input.wCm, hCm: input.hCm, unit: !!input.unit, stretch: false, specs: [],
    vb: `0 0 ${Math.round(input.wCm * 4)} ${Math.round(input.hCm * 4)}`, png: input.png, custom: true,
  };
}

/**
 * Shrink a picture for the PNG door: ≤ 512px on the long edge, PNG so the
 * transparency survives, and refused past ~700 KB — a Firestore document holds
 * a megabyte and the record has to fit in one.
 */
export async function shrinkPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not an image')); i.src = url; });
    const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/png');
    if (out.length > 700_000) throw new Error('too big');
    return out;
  } finally { URL.revokeObjectURL(url); }
}
