/**
 * Reading the job's ADDRESS and PHONE NUMBER off the plan itself.
 *
 * Every consultant sheet carries both in its title block, and the secretary
 * was retyping them. This reads the plan's own TEXT LAYER with pdf.js —
 * entirely local, in the browser, no service and nothing to install — finds
 * the line that looks like an address (and the one that looks like a phone
 * number), and renders a CUTOUT image of that part of the sheet big enough to
 * read, so a person confirms against the drawing before anything is written.
 *
 * Hebrew arrives from PDF text layers in every order there is: logical,
 * visual (each run's characters stored right-to-left), and mixtures. Reading
 * it one way — which is what the first version did — is where the "a lot of
 * times it reads the Hebrew very gibberish" report came from. Every Hebrew
 * line is therefore tried in BOTH character orders and both run orders, and
 * the variant that actually matches an address or phone pattern is the one
 * believed; digit and Latin runs are kept forwards when a string is flipped,
 * or "12" becomes "21" in the one field where that matters.
 *
 * THE HONESTY RULE (owner, 2026-10-05). On A1-12 the drawer offered an
 * address and a classic sample number that were printed nowhere on the
 * sheet, and the eye could only show the whole page with no box — "where is
 * it getting this from? If there's no phone number and there's no address,
 * it should be empty." So a value is offered ONLY when the app can show
 * WHERE on the sheet it was read:
 *  · every value carries a box on the page and a readable cutout of that
 *    spot, or it is not offered at all;
 *  · on a sheet WITH a text layer, the vision model's answer must be found in
 *    that text — the phone digit for digit, the address word for word — and
 *    the place it was found IS the box; not found means not printed, dropped;
 *  · on a scan the model must point at the value (a box), and the box must
 *    hold ink; a value it cannot point at is dropped;
 *  · sample numbers (054-1234567, 050-0000000 …) and the office's own lines
 *    are never offered, by either reader.
 *
 * pdf.js is imported lazily (the planAspect idiom): suggesting an address
 * must never add a megabyte of PDF engine to the main bundle.
 */
import { fetchPlanBytes } from './driveApi';
import { aiPlanReadingAvailable, aiReadPlanImage, canvasToJpeg, type Frac } from './planAi';
import { tokenize } from './hebrewNormalize';

export type { Frac } from './planAi';

export interface PlanAddressResult {
  /** Best-effort text of the address line. The cutout is the ground truth. */
  address?: string;
  /** PNG data URL of the region around it, rendered large enough to read. */
  cutout?: string;
  /** Where the address sits INSIDE the cutout (fractions of the cutout). */
  cutoutBox?: Frac;
  /** Where the address sits on the PAGE (fractions of the first page). */
  addressBox?: Frac;
  /** Who read it: the sheet's own text, or the vision model (verified). */
  addressFrom?: 'text' | 'ai';
  /** Best-effort phone number found on the sheet. */
  phone?: string;
  /** PNG data URL of the region the phone was read from. */
  phoneCutout?: string;
  /** Where the phone sits INSIDE its cutout. */
  phoneCutoutBox?: Frac;
  /** Where the phone sits on the PAGE. */
  phoneBox?: Frac;
  phoneFrom?: 'text' | 'ai';
  /** The whole first page, small — the "where on the sheet" picture. */
  sheet?: string;
  problem?: 'no-text' | 'no-address' | 'unreachable';
  /** The family name — kept only when the model's reading is printed on the sheet. */
  family?: string;
  /** True when a vision model answered — whether or not its values survived the check. */
  ai?: boolean;
}

interface Part { x: number; str: string; w?: number; y?: number; h?: number }

interface Line {
  text: string;
  hebrew: boolean;
  x1: number; y1: number; x2: number; y2: number;
  parts: Part[];
}

const LABEL = /(כתובת|address)/i;
const STREET = /(רח'|רחוב|שד'|שדרות|דרך|סמט|\bst\.?\b|\bstreet\b|\bave(nue)?\b|\brd\.?\b|\broad\b|\bblvd\b)/i;
const HEB = /[֐-׿]/;
/** An Israeli (or international) phone number as it is printed on a sheet. */
const PHONE = /(?:\+\s?972[-\s.]?\(?0?\)?[-\s.]?|0)(?:[23489]|5\d|7[2-9])[-\s.]?\d{3}[-\s.]?\d{4}\b/;
const PHONE_LABEL = /(טלפון|טל'?|נייד|פלאפון|סלולרי|\bphone\b|\btel\.?\b|\bmobile\b|\bcell\b)/i;
const FAX = /(פקס|\bfax\b)/i;

/**
 * TzviAir's OWN numbers, never a suggestion. The consultant's title block
 * usually carries the company's phone right beside the customer's, and the
 * reader kept offering the office back to itself ("it recognizes our office
 * number — that's a problem"). Compared digit-for-digit after normalising,
 * so 02-628-8282, (02) 6288282 and +972-2-6288282 are all the same number.
 */
const OWN_NUMBERS = new Set(['026288282', '037208000']);

/** A printed number reduced to bare local digits for comparison. */
export function normalizePhoneDigits(s: string): string {
  let d = s.replace(/[^\d+]/g, '');
  if (d.startsWith('+972')) d = '0' + d.slice(4).replace(/^0/, '');
  else if (d.startsWith('972')) d = '0' + d.slice(3).replace(/^0/, '');
  return d.replace(/[^\d]/g, '');
}

/**
 * A SAMPLE number, never a customer's: the run a model (or a template) types
 * when it has nothing to read — 054-1234567, 123-4567, 050-0000000, 000-0000.
 * Seven digits climbing or falling by one (a whole subscriber part, 1234567 /
 * 7654321), or six or more of the same digit; anything too short to be a
 * phone at all counts too. SEVEN, not six: a real number can hold a run of six
 * (050-312-3456) and must not be refused for it. The same rule lives in
 * api/geocode.js — change one, change both.
 */
export function isPlaceholderPhone(raw: string): boolean {
  const d = normalizePhoneDigits(raw);
  if (d.length < 7) return true;
  if (/(\d)\1{5,}/.test(d)) return true;
  let up = 1, down = 1;
  for (let i = 1; i < d.length; i++) {
    const a = +d[i - 1], b = +d[i];
    up = b === a + 1 ? up + 1 : 1;
    down = b === a - 1 ? down + 1 : 1;
    if (up >= 7 || down >= 7) return true;
  }
  return false;
}

/**
 * The office's OWN address lines, never the customer's — every sheet prints
 * TzviAir's two offices beside the customer block: 9 Nachal Kidron (RBSA) in
 * Beit Shemesh and the Azrieli Sarona Tower, 121 Derech Menachem Begin, in
 * Tel Aviv. The same list lives in api/geocode.js — change one, change both.
 */
const OFFICE_ADDRESS = [
  /\bazrieli\b/i, /עזריאלי/,
  /\bsarona\b/i, /שרונה/,
  /menachem\s+begin\D{0,8}\b121\b|\b121\b\D{0,16}menachem\s+begin/i,
  /מנחם\s+בגין\D{0,8}121|121\D{0,16}מנחם\s+בגין/,
];
/**
 * Streets the office SHARES with customers: only the office's own house
 * number — or no number at all, which is how an office line prints — is the
 * office. A customer at 14 Nachal Kidron is a customer.
 */
const OFFICE_STREETS: { street: RegExp; num: string }[] = [
  { street: /\bna(?:ch|kh|h)al\s*kidron\b|נחל\s*קדרון/i, num: '9' },
  { street: /\bderech\s+menachem\s+begin\b|דרך\s+מנחם\s+בגין/i, num: '121' },
];
export function isOfficeAddress(s: string): boolean {
  if (OFFICE_ADDRESS.some(re => re.test(s))) return true;
  return OFFICE_STREETS.some(({ street, num }) => {
    if (!street.test(s)) return false;
    const nums: string[] = s.match(/\d+/g) ?? [];
    return nums.length === 0 || nums.includes(num);
  });
}

/** One of the office's own phone numbers, in any printed form. */
export function isOfficeNumber(raw: string): boolean {
  return OWN_NUMBERS.has(normalizePhoneDigits(raw));
}

/** Strip the label word itself, so "כתובת: הרצל 12" suggests "הרצל 12". */
/** Whitespace folded, and no stray ':' '+' '-' hanging off either end. */
export function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s:：\-–—+·,;]+|[\s:：\-–—+·,;]+$/g, '').trim();
}

function stripLabel(text: string): string {
  return text.replace(/.*?(כתובת|address)\s*[:\-–]?\s*/i, '').trim();
}

/**
 * Flip a visually-stored string back to logical order: reverse the whole
 * thing, then un-reverse every run of digits or Latin — numbers and English
 * words are stored forwards even inside a visual Hebrew line.
 */
export function fixVisual(s: string): string {
  const flipped = [...s].reverse().join('');
  return flipped.replace(/[0-9A-Za-z][0-9A-Za-z ./-]*[0-9A-Za-z]|[0-9A-Za-z]/g,
    run => [...run].reverse().join(''));
}

const flipStr = (s: string) => [...s].reverse().join('');

/**
 * Every plausible reading of a line. A Hebrew line is offered in both run
 * orders and both character orders; whichever variant matches the pattern
 * being hunted is the one used, so a sheet whose text layer is stored
 * visually still reads out as words rather than gibberish.
 */
function variantsOf(l: Line): string[] {
  const rtl = [...l.parts].sort((a, b) => b.x - a.x).map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
  if (!l.hebrew) return [rtl];
  const ltr = [...l.parts].sort((a, b) => a.x - b.x).map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
  /**
   * PLAIN full reversal, beside fixVisual — and deliberately AHEAD of it.
   *
   * pdf.js runs its own bidi over every text item: on a visually-stored
   * Hebrew line it hands back the Hebrew still reversed but the DIGIT runs
   * already flipped ("מגיני הגוש 48" arrives as "84 שוגה יניגמ"). Undoing
   * that is a bare character reversal; fixVisual's digit re-reverse — right
   * for a raw visual layer — turns the house number into its mirror ("84").
   * The two recoveries tie on every quality signal, so list order decides,
   * and the pdf.js-shaped one is what the reader actually receives.
   */
  const out = [rtl, ltr, flipStr(ltr), fixVisual(ltr), flipStr(rtl), fixVisual(rtl)];
  return [...new Set(out.filter(Boolean))];
}

/** The share of a string that is digits — an "address" that is mostly digits is a number, not a street. */
function digitShare(s: string): number {
  const chars = s.replace(/\s/g, '');
  if (!chars.length) return 0;
  return (chars.match(/\d/g)?.length ?? 0) / chars.length;
}

/**
 * Does this read like Hebrew the right way round?
 *
 * Final letters (ך ם ן ף ץ) are the giveaway: real Hebrew carries them at
 * word ENDS; a reversed line carries them at word STARTS or mid-word. A line
 * like "מגיני הגוש 48" has no finals at all, which is why this is a SCORE the
 * variants compete on rather than a yes/no — the reversed junk in the same
 * set usually loses points even when the right answer earns none.
 */
export function hebrewQuality(s: string): number {
  let q = 0;
  for (const w of s.split(/\s+/)) {
    const core = w.replace(/[^֐-׿]/g, '');
    if (!core) continue;
    if (/[םןץףך]$/.test(core)) q += 2;
    if (/^[םןץףך]/.test(core)) q -= 3;
    if (core.length > 2 && /[םןץףך]/.test(core.slice(1, -1))) q -= 2;
  }
  return q;
}

/**
 * The most Hebrew-plausible reading of a line. Street words help; and in a
 * Hebrew address the house NUMBER comes last — "מגיני הגוש 48" — so digits
 * trailing earn a point and digits leading lose one, which is what separates
 * the right reading from its mirror when neither carries a final letter.
 */
function pickReading(vs: string[]): string {
  let best = vs[0] ?? '';
  let bq = -Infinity;
  for (const v of vs) {
    const q = hebrewQuality(v)
      + (STREET.test(v) ? 3 : 0)
      + (HEB.test(v) && /\d\s*$/.test(v) ? 1 : 0)
      - (HEB.test(v) && /^\s*\d/.test(v) ? 1 : 0);
    if (q > bq) { bq = q; best = v; }
  }
  return best;
}

/**
 * Only the parts of a line that sit in the LABEL'S OWN COLUMN.
 *
 * A "line" here is a y-band across the WHOLE sheet, so the band level with a
 * title-block value can pick up dimension text from the middle of the floor
 * plan — which is exactly the Miller gibberish: the address came back with
 * half the drawing's annotations glued on. The value under a label lives in
 * the label's column; everything else in the band is scenery.
 */
function columnLine(label: Line, band: Line): Line {
  const cx = (label.x1 + label.x2) / 2;
  const halfW = Math.max(160, (label.x2 - label.x1) * 3);
  const parts = band.parts.filter(pt => Math.abs(pt.x - cx) < halfW);
  if (parts.length === band.parts.length) return band;
  // NOTHING in the label's column is nothing — never the rest of the band.
  // Handing back the whole band read a garbled caption from the opposite
  // margin as the address (the 2026-10-08 sheet, whose value is outlines).
  if (!parts.length) return { ...band, parts: [], text: '' };
  return { ...band, parts };
}

/**
 * A UNIT label wearing an address's clothes: "בניין 2 דירה 5", "קומה 3" —
 * building/apartment/floor words plus digits and nothing else. That is which
 * unit the sheet describes, not where the building stands, and offering it
 * back as the address was the owner's Shwartz screenshot. A real address that
 * merely ENDS in "דירה 5" survives — the street part is the something-else.
 */
const UNIT_WORDS = /(בניין|בנין|מבנה|דירה|קומה|מגרש|יחידה|כניסה|building|bldg|apt|apartment|floor|unit)/i;
function unitLabelOnly(s: string): boolean {
  if (!UNIT_WORDS.test(s)) return false;
  // A fresh global copy per call — a shared /g regex's lastIndex is state,
  // and a stateful test() answers wrongly every second time.
  const rest = s.replace(new RegExp(UNIT_WORDS.source, 'gi'), ' ')
    .replace(/[\d\s.,:/\-–—']+/g, ' ').trim();
  return rest.length < 2;
}

/** A believable address VALUE: carries a number, a street word, or at least
 *  two real Hebrew words. Anything less is scenery, and silence beats junk. */
function plausibleAddress(s: string): boolean {
  if (unitLabelOnly(s)) return false;
  if (/\d/.test(s) || STREET.test(s)) return true;
  return s.split(/\s+/).filter(w => w.replace(/[^֐-׿]/g, '').length >= 2).length >= 2;
}

/** Any printed text that is the office talking about itself — its numbers or its addresses. */
function officeText(s: string): boolean {
  if (isOfficeAddress(s)) return true;
  for (const d of phoneCandidates(s)) if (OWN_NUMBERS.has(d)) return true;
  return false;
}

/**
 * Rebuild LINES from positioned glyph runs: group by baseline y (within most
 * of a line height), then keep the runs with their x positions so both
 * joining orders stay available. Shared by the automatic read and the
 * pick-it-yourself box — one line model, or the two would disagree about
 * what sits where.
 */
function buildLines(items: { str: string; transform: number[]; width: number; height: number }[]): Line[] {
  const runs = items.map(it => ({
    str: it.str.trim(),
    x: it.transform[4],
    y: it.transform[5],
    w: it.width,
    h: Math.abs(it.height || Math.hypot(it.transform[2], it.transform[3])) || 8,
  }));
  runs.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const r of runs) {
    const line = lines.find(l => Math.abs(l.y1 - r.y) < Math.max(3, r.h * 0.7));
    const part: Part = { x: r.x, str: r.str, w: r.w, y: r.y, h: r.h };
    if (line) {
      line.x1 = Math.min(line.x1, r.x); line.x2 = Math.max(line.x2, r.x + r.w);
      line.y2 = Math.max(line.y2, r.y + r.h);
      line.parts.push(part);
    } else {
      lines.push({
        text: '', hebrew: false, x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h,
        parts: [part],
      });
    }
  }
  for (const l of lines) {
    l.hebrew = l.parts.some(p => HEB.test(p.str));
    // The default reading — right-to-left for a Hebrew line, as before.
    l.parts.sort((a, b) => (l.hebrew ? b.x - a.x : a.x - b.x));
    l.text = l.parts.map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  return lines;
}

// ── WHERE a value is printed ────────────────────────────────────────────────
//
// A line is a y-band across the whole sheet, so it is cut into SEGMENTS at its
// wide gaps — one phrase each, the title block's value apart from the floor
// plan's dimension text at the same height. A value is looked for in the
// segments, and the items that actually hold it are its box.

interface Seg { parts: Part[]; lineH: number; x1: number; x2: number; y1: number; y2: number }
/** A rectangle in PDF user space (y UP), as pdf.js measures text. */
interface Rect { x1: number; y1: number; x2: number; y2: number }

function partW(p: Part, lineH: number): number {
  return p.w && p.w > 0 ? p.w : Math.max(4, p.str.length * lineH * 0.5);
}

/** One text item's ink, with room for descenders below the baseline. */
function partRect(p: Part, lineH: number, lineY: number): Rect {
  const h = p.h ?? lineH;
  const y = p.y ?? lineY;
  return { x1: p.x, x2: p.x + partW(p, lineH), y1: y - h * 0.24, y2: y + h };
}

function unionRect(rs: Rect[]): Rect {
  return {
    x1: Math.min(...rs.map(r => r.x1)), x2: Math.max(...rs.map(r => r.x2)),
    y1: Math.min(...rs.map(r => r.y1)), y2: Math.max(...rs.map(r => r.y2)),
  };
}

function segmentsOf(lines: Line[]): Seg[] {
  const out: Seg[] = [];
  for (const l of lines) {
    const lineH = Math.max(4, l.y2 - l.y1);
    const gapMax = Math.max(24, lineH * 2.2);
    const ps = [...l.parts].sort((a, b) => a.x - b.x);
    let cur: Part[] = [];
    let end = -Infinity;
    const flush = () => {
      if (!cur.length) return;
      const r = unionRect(cur.map(p => partRect(p, lineH, l.y1)));
      out.push({ parts: cur, lineH, ...r });
      cur = [];
    };
    for (const p of ps) {
      if (cur.length && p.x - end > gapMax) flush();
      if (!cur.length) end = -Infinity;
      cur.push(p);
      end = Math.max(end, p.x + partW(p, lineH));
    }
    flush();
  }
  return out;
}

/**
 * Every way ONE text item can have come back from pdf.js. Its bidi hands a
 * Hebrew item back in either character order, and with its digit runs
 * reversed (a number inside a Hebrew item arrives as "6193-847-250"), so an
 * item is tried as given, reversed, and with its digit runs turned back both
 * ways. An item with no Hebrew is exactly what it says.
 */
function itemReadings(s: string): string[] {
  if (!HEB.test(s)) return [s];
  const f = flipStr(s);
  return [...new Set([s, f, fixVisual(s), fixVisual(f)])];
}

/** The readings of a run of items, for numbers that span several of them. */
function runReadings(parts: Part[]): string[] {
  const asc = [...parts].sort((a, b) => a.x - b.x);
  const a = asc.map(p => p.str).join(' ');
  const b = [...asc].reverse().map(p => p.str).join(' ');
  const perItem = asc.map(p => (HEB.test(p.str) ? flipStr(p.str) : p.str)).join(' ');
  const out = new Set([a, b, perItem]);
  if (HEB.test(a)) for (const s of [a, b]) { out.add(flipStr(s)); out.add(fixVisual(s)); }
  return [...out];
}

/**
 * Every phone-length number a piece of text can hold: each run of digits and
 * separators, every unbroken stretch of its digit groups, normalised. A
 * number split across items ("052" "748" "3916"), bracketed ("(052) 748-3916")
 * or with the next line's digits glued on ("02-628-8282 9 Nachal Kidron") is
 * still found exactly — and only exactly.
 */
export function phoneCandidates(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(/\+?\d[\d\s().\-–]*/g)) {
    const groups = m[0].match(/\+?\d+/g) ?? [];
    for (let i = 0; i < groups.length; i++) {
      let joined = '';
      for (let j = i; j < groups.length && j < i + 6; j++) {
        joined += groups[j];
        const d = normalizePhoneDigits(joined);
        if (d.length > 13) break;
        if (d.length >= 7) out.add(d);
      }
    }
  }
  return out;
}

/** The smallest run of a segment's items that holds this exact number, or null. */
function phoneWindow(seg: Seg, digits: string): Part[] | null {
  const has = (ps: Part[]) => runReadings(ps).some(r => phoneCandidates(r).has(digits));
  if (!has(seg.parts)) return null;
  const ps = [...seg.parts].sort((a, b) => a.x - b.x);
  for (let len = 1; len <= ps.length; len++) {
    for (let i = 0; i + len <= ps.length; i++) {
      const w = ps.slice(i, i + len);
      if (has(w)) return w;
    }
  }
  return ps;
}

/** Street-type and connector words — they say nothing about WHICH street. */
const STOP_WORDS = new Set([
  'רחוב', 'רח', 'שד', 'שדרות', 'דרכ', 'סמטה', 'סמט', 'כתובת', 'address',
  'st', 'street', 'rd', 'road', 'ave', 'avenue', 'blvd', 'boulevard', 'ln', 'lane',
]);

/** The words an address must be found by: digits (house numbers) and real words, minus street-type words. */
function needTokens(value: string): string[] {
  return [...new Set(tokenize(value))]
    .filter(t => !STOP_WORDS.has(t) && (/^\d+$/.test(t) || t.length >= 2));
}

/** Every word on a run of items, in every reading, mapped to the items that carry it. */
function wordIndex(parts: Part[]): Map<string, Set<Part>> {
  const m = new Map<string, Set<Part>>();
  for (const p of parts) {
    for (const r of itemReadings(p.str)) {
      for (const t of tokenize(r)) {
        let s = m.get(t);
        if (!s) { s = new Set(); m.set(t, s); }
        s.add(p);
      }
    }
  }
  return m;
}

/** One letter added, dropped or changed — a model's "corrected" spelling of a printed word. */
function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * How much of a value's words a region carries, by weight (house numbers
 * count, long words count more than short ones), and which items carry them.
 * A house number must be found EXACTLY: "נחלת יצחק 12" next to a printed
 * "דירה 12" shares a number and nothing else.
 */
function matchWords(need: string[], idx: Map<string, Set<Part>>) {
  let total = 0, got = 0, matched = 0;
  let digitsOk = true;
  const parts = new Set<Part>();
  for (const t of need) {
    const isNum = /^\d+$/.test(t);
    const w = isNum ? 3 : Math.min(8, t.length);
    total += w;
    let hit = idx.get(t);
    if (!hit && !isNum && t.length >= 4) {
      for (const [k, ps] of idx) if (!/^\d+$/.test(k) && oneEditApart(k, t)) { hit = ps; break; }
    }
    if (hit) { got += w; matched++; hit.forEach(p => parts.add(p)); }
    else if (isNum) digitsOk = false;
  }
  return { score: total ? got / total : 0, parts, digitsOk, matched };
}

/** Is `b` the line directly under `a`, in the same column? (PDF y grows UP.) */
function directlyBelow(a: Seg, b: Seg): boolean {
  const lh = Math.max(a.lineH, b.lineH);
  const drop = a.y1 - b.y2;
  if (drop < -lh * 0.3 || drop > lh * 2.4) return false;
  return Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > -12;
}

interface Found { rect: Rect; lineH: number }

/**
 * Find a value's WORDS on the sheet — a segment, or a segment and the one
 * under it (an address that wraps onto a second line) — and box the items
 * that carry them. Three quarters of its weight, every house number, and at
 * least `minWords` words must be found; a nearer region wins a tie when a
 * hint says where to look. A region that is the office's own block never
 * counts, whatever the words say — answered as 'office' when it was the only
 * place they were found.
 */
function locateWords(
  value: string, segs: Seg[], hint: { x: number; y: number } | null, minWords: number,
): Found | 'office' | null {
  const need = needTokens(value);
  if (need.length < minWords) return null;
  const idx = segs.map(s => wordIndex(s.parts));
  const regions: { ss: Seg[]; ix: Map<string, Set<Part>> }[] = segs.map((s, i) => ({ ss: [s], ix: idx[i] }));
  // Pairs: each segment with the one directly under it. Sorted top-first, so
  // the inner walk can stop as soon as it is past the next line's reach.
  const order = segs.map((_, i) => i).sort((a, b) => segs[b].y2 - segs[a].y2);
  const tallest = segs.reduce((m, s) => Math.max(m, s.lineH), 4);
  for (let oi = 0; oi < order.length; oi++) {
    const a = segs[order[oi]];
    for (let oj = oi + 1; oj < order.length; oj++) {
      const b = segs[order[oj]];
      if (a.y1 - b.y2 > tallest * 2.4) break;
      if (!directlyBelow(a, b)) continue;
      const ix = new Map(idx[order[oi]]);
      for (const [k, ps] of idx[order[oj]]) ix.set(k, new Set([...(ix.get(k) ?? []), ...ps]));
      regions.push({ ss: [a, b], ix });
    }
  }
  let best = null as null | { parts: Part[]; score: number; d: number; lineH: number };
  let sawOffice = false;
  for (const { ss, ix } of regions) {
    const m = matchWords(need, ix);
    if (m.score < 0.75 || !m.digitsOk || m.matched < Math.min(need.length, Math.max(minWords, 2))) continue;
    const parts = [...m.parts];
    if (parts.some(p => itemReadings(p.str).some(officeText))) { sawOffice = true; continue; }
    const lineH = Math.max(...ss.map(s => s.lineH));
    const r = unionRect(parts.map(p => partRect(p, lineH, ss[0].y1)));
    const d = hint ? Math.hypot((r.x1 + r.x2) / 2 - hint.x, (r.y1 + r.y2) / 2 - hint.y) : 0;
    const better = !best
      || m.score > best.score + 1e-9
      || (Math.abs(m.score - best.score) <= 1e-9 && (parts.length < best.parts.length
        || (parts.length === best.parts.length && d < best.d)));
    if (better) best = { parts, score: m.score, d, lineH };
  }
  if (!best) return sawOffice ? 'office' : null;
  const lineH = best.lineH;
  return { rect: unionRect(best.parts.map(p => partRect(p, lineH, p.y ?? 0))), lineH };
}

/** Find an exact phone number on the sheet, nearest the hint when it is printed twice. */
function locatePhone(digits: string, segs: Seg[], hint: { x: number; y: number } | null): Found | null {
  let best: { rect: Rect; lineH: number; d: number } | null = null;
  for (const seg of segs) {
    const win = phoneWindow(seg, digits);
    if (!win) continue;
    const rect = unionRect(win.map(p => partRect(p, seg.lineH, seg.y1)));
    const d = hint ? Math.hypot((rect.x1 + rect.x2) / 2 - hint.x, (rect.y1 + rect.y2) / 2 - hint.y) : 0;
    if (!best || d < best.d) best = { rect, lineH: seg.lineH, d };
  }
  return best ? { rect: best.rect, lineH: best.lineH } : null;
}

/** A model's box on a scan is a SPOT — small, inside the page, not a sliver. */
function usableBox(b: Frac | null | undefined): Frac | null {
  if (!b) return null;
  const f = {
    x0: Math.max(0, Math.min(b.x0, b.x1)), y0: Math.max(0, Math.min(b.y0, b.y1)),
    x1: Math.min(1, Math.max(b.x0, b.x1)), y1: Math.min(1, Math.max(b.y0, b.y1)),
  };
  const w = f.x1 - f.x0, h = f.y1 - f.y0;
  if (w < 0.004 || h < 0.003 || w > 0.6 || h > 0.25) return null;
  return f;
}

/** The share of a box on a rendered page that is INK — a box over blank paper points at nothing. */
function inkShare(canvas: HTMLCanvasElement, b: Frac): number {
  const g = canvas.getContext('2d');
  if (!g) return 0;
  const x = Math.max(0, Math.floor(b.x0 * canvas.width));
  const y = Math.max(0, Math.floor(b.y0 * canvas.height));
  const w = Math.max(1, Math.min(canvas.width - x, Math.ceil((b.x1 - b.x0) * canvas.width)));
  const h = Math.max(1, Math.min(canvas.height - y, Math.ceil((b.y1 - b.y0) * canvas.height)));
  const data = g.getImageData(x, y, w, h).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 150) dark++;
  }
  return dark / (w * h);
}
const MIN_INK = 0.012;

/**
 * The pick-it-yourself session: the whole first page rendered once, and a
 * `read` that answers "what does the text under THIS box say?" through the
 * same line model and Hebrew-order machinery as the automatic read. Exists
 * because the automatic read is a guess over an arbitrary title block, and
 * when it guesses wrong the fix is a human pointing at the right spot — not
 * a smarter guess. On a scan there is no text to read, and only the vision
 * model can read the box (`hasText: false`).
 */
export interface RegionReader {
  /** PNG data URL of the whole first page. */
  image: string;
  /** That image's pixel size. */
  w: number; h: number;
  /** False on a scan: `read` always answers '' and only the AI can read a box. */
  hasText: boolean;
  /** The text inside a box, corners as FRACTIONS of the image (x across, y down). */
  read(r: { x0: number; y0: number; x1: number; y1: number }): string;
  /** A JPEG of that box, enlarged — what the AI reader is shown. */
  crop(r: { x0: number; y0: number; x1: number; y1: number }): string;
  /** Free the pdf.js document. */
  close(): void;
}

export async function openRegionReader(fileId: string): Promise<RegionReader | null> {
  let bytes: ArrayBuffer;
  try {
    bytes = await fetchPlanBytes(fileId);
  } catch {
    return null;
  }
  await import('../components/plans/pdfCompat');
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items = (content.items as {
      str: string; transform: number[]; width: number; height: number;
    }[]).filter(it => it.str && it.str.trim());
    const hasText = items.length >= 5;
    // A scan is only worth a picker when a model can read the box.
    if (!hasText && !aiPlanReadingAvailable()) { void doc.destroy().catch(() => {}); return null; }
    const lines = hasText ? buildLines(items).sort((a, b) => b.y1 - a.y1) : [];   // top of the sheet first

    // The whole sheet, as large as a canvas will take (area-capped — a
    // refused canvas is a blank picker, the standing cutout rule).
    const base = page.getViewport({ scale: 1 });
    const MAX_AREA = 4_200_000;
    const scale = Math.min(2.5, Math.sqrt(MAX_AREA / Math.max(1, base.width * base.height)));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) { void doc.destroy().catch(() => {}); return null; }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp } as never).promise;
    const image = canvas.toDataURL('image/png');
    const w = canvas.width, h = canvas.height;

    return {
      image, w, h, hasText,
      crop(r) { return canvasToJpeg(canvas, r); },
      read(r) {
        if (!hasText) return '';
        // Image fractions -> PDF user space, through the render viewport (y
        // flips there; convertToPdfPoint owns that arithmetic).
        const a = vp.convertToPdfPoint(r.x0 * w, r.y0 * h);
        const b = vp.convertToPdfPoint(r.x1 * w, r.y1 * h);
        const rx1 = Math.min(a[0], b[0]), rx2 = Math.max(a[0], b[0]);
        const ry1 = Math.min(a[1], b[1]), ry2 = Math.max(a[1], b[1]);
        // ONLY what is inside the box (owner, 2026-09-07: "even if I draw
        // the box directly over the address, it still gets the words around
        // it"). A line counts when its MIDDLE is inside the box's height, and
        // a part when its CENTRE is inside the box's width — a box that
        // grazes the next line's edge no longer drags "Floor:" in with it.
        const picked: string[] = [];
        for (const l of lines) {
          const ly = (l.y1 + l.y2) / 2;
          if (ly < ry1 || ly > ry2) continue;
          const parts = l.parts.filter(pt => { const cx = pt.x + (pt.w ?? 24) / 2; return cx >= rx1 && cx <= rx2; });
          if (!parts.length) continue;
          const read = pickReading(variantsOf({ ...l, parts }));
          if (read) picked.push(read);
        }
        return tidy(picked.join(' '));
      },
      close() { void doc.destroy().catch(() => {}); },
    };
  } catch {
    void doc.destroy().catch(() => {});
    return null;
  }
}

const cache = new Map<string, PlanAddressResult>();
const inFlight = new Map<string, Promise<PlanAddressResult>>();
/** Results hold page pictures; a long day of plans must not keep them all. */
const CACHE_MAX = 40;

export function readPlanAddress(fileId: string): Promise<PlanAddressResult> {
  const hit = cache.get(fileId);
  if (hit) return Promise.resolve(hit);
  const going = inFlight.get(fileId);
  if (going) return going;
  const p = readNow(fileId)
    .then(r => {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(fileId, r);
      return r;
    })
    .catch(() => ({ problem: 'unreachable' as const }))
    .finally(() => inFlight.delete(fileId));
  inFlight.set(fileId, p);
  return p;
}

/** A value and where it is — page fractions, plus the text height there (page units). */
interface Spot { value: string; box: Frac; lineH: number; from: 'text' | 'ai' }

async function readNow(fileId: string): Promise<PlanAddressResult> {
  let bytes: ArrayBuffer;
  try {
    bytes = await fetchPlanBytes(fileId);
  } catch {
    return { problem: 'unreachable' };
  }

  await import('../components/plans/pdfCompat');   // shims must land before pdf.js
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items = (content.items as {
      str: string; transform: number[]; width: number; height: number;
    }[]).filter(it => it.str && it.str.trim());

    // A scan has no text layer — a handful of stray marks is the same thing.
    // Without a vision model there is nothing to read it with.
    const hasText = items.length >= 5;
    if (!hasText && !aiPlanReadingAvailable()) return { problem: 'no-text' };

    /** The page at scale 1 — every box is a fraction of THIS (rotation included). */
    const vp1 = page.getViewport({ scale: 1 });
    const W1 = vp1.width, H1 = vp1.height;
    const toFrac = (r: Rect): Frac => {
      const [ax, ay, bx, by] = vp1.convertToViewportRectangle([r.x1, r.y1, r.x2, r.y2]);
      return {
        x0: Math.max(0, Math.min(ax, bx) / W1), y0: Math.max(0, Math.min(ay, by) / H1),
        x1: Math.min(1, Math.max(ax, bx) / W1), y1: Math.min(1, Math.max(ay, by) / H1),
      };
    };
    /** A page-fraction point back into PDF user space, for "nearest to" hints. */
    const toPdf = (f: Frac) => {
      const [x, y] = vp1.convertToPdfPoint(((f.x0 + f.x1) / 2) * W1, ((f.y0 + f.y1) / 2) * H1);
      return { x, y };
    };

    const lines = hasText ? buildLines(items) : [];
    const segs = hasText ? segmentsOf(lines) : [];

    /**
     * THE TITLE BLOCK — where a customer's details are printed (owner,
     * 2026-10-08: "the address should usually come from this side — the
     * right side of the sheet"). On a landscape sheet the right-hand column
     * (and a bottom strip); on a portrait one the bottom (and a right strip).
     * Outside it, a line counts only when it carries an explicit label —
     * the legend and the photo captions in the margins once handed back
     * their (garbled) Hebrew as the "address".
     */
    const landscape = W1 >= H1;
    const inTitleFrac = (f: Frac) => (landscape
      ? (f.x0 >= 0.62 || f.y0 >= 0.82)
      : (f.y0 >= 0.68 || f.x0 >= 0.66));
    const inTitleBlock = (l: Line) => inTitleFrac(toFrac({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }));
    const titleBlockBonus = (l: Line) => (inTitleBlock(l) ? 25 : 0);
    /** Does the text layer print anything inside this box? (fractions) */
    const textInBox = (b: Frac) => segs.some(sg => sg.parts.some(pt => {
      const f = toFrac(partRect(pt, sg.lineH, sg.y1));
      const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
      return cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;
    }));
    /**
     * The model's answer on a page WITH a text layer, where the value itself
     * is not text (outlines — the 2026-10-08 sheet's Hebrew address): it
     * stands only where it points at INK, inside the title block, with NO
     * text printed there. Text in the box that does not match the answer
     * means the answer is not what is printed — refused, as before.
     */
    const outlinedSpot = (box: Frac | null | undefined, canvas: HTMLCanvasElement): Frac | null => {
      const b = usableBox(box);
      if (!b || !inTitleFrac(b) || textInBox(b)) return null;
      return inkShare(canvas, b) >= MIN_INK ? b : null;
    };

    // ── The ADDRESS ─────────────────────────────────────────────────────────
    let bestAddr: { line: Line; extra?: Line; text: string; score: number } | null = null;
    lines.forEach((l, i) => {
      // A phone or fax line is never an address, however address-shaped its
      // digits look — this was "it's pulling it from the phone number".
      if (PHONE_LABEL.test(l.text) || FAX.test(l.text)) return;
      let score = 0;
      let text = '';
      let extra: Line | undefined;
      // A line is a y-band across the WHOLE sheet, so the band holding the
      // label "Address:" also holds whatever else sits at that height — on
      // the 2026-10-08 sheet a garbled Hebrew photo caption in the far left
      // margin, which came back as the address. Read only the label's column.
      const lp = l.parts.find(pt => LABEL.test(pt.str));
      const labelLine: Line = lp ? { ...l, x1: lp.x, x2: lp.x + (lp.w ?? 40), parts: [lp] } : l;
      const src = lp ? columnLine(labelLine, l) : l;
      for (const v of variantsOf(src)) {
        if (LABEL.test(v)) {
          const stripped = stripLabel(v);
          if (score < 100) { score = 100; text = stripped; }
          // Several variants can carry the label; keep the value that reads
          // most like real Hebrew rather than the first one that turned up.
          else if (stripped.length >= 3 && hebrewQuality(stripped) > hebrewQuality(text)) text = stripped;
          if (stripped.length < 3) {
            // "כתובת:" alone — the value sits on the neighbouring line.
            const next = lines[i + 1];
            if (next && Math.abs(next.y1 - l.y1) < (l.y2 - l.y1) * 3
                && !PHONE_LABEL.test(next.text) && !PHONE.test(next.text)) {
              // Only the label's own column of that band, read in the most
              // Hebrew-plausible order — and if what is there does not look
              // like an address at all, say nothing rather than gibberish.
              const sub = columnLine(labelLine, next);
              const read = pickReading(variantsOf(sub));
              text = plausibleAddress(read) ? read : '';
              extra = next;
            }
          }
        } else if (STREET.test(v) && /\d/.test(v) && 60 > score) {
          score = 60; text = v;
        }
      }
      if (!score) return;
      if (score < 100 && !inTitleBlock(l)) return;
      const clean = text.replace(/\s+/g, ' ').trim();
      if (clean.length < 3 || clean.length > 90) return;
      // Mostly digits is a number wearing a street word, not an address —
      // and "בניין 2 דירה 5" is the UNIT, not the street.
      if (digitShare(clean) > 0.55 || PHONE.test(clean) || unitLabelOnly(clean)) return;
      // Nor is the office describing itself — its address or its number.
      // Judged on the VALUE, not the band: a band runs the width of the
      // sheet, and the office block can share a baseline with the customer.
      if (officeText(clean)) return;
      score += titleBlockBonus(l);
      if (!bestAddr || score > bestAddr.score) bestAddr = { line: l, extra, text: clean, score };
    });

    // ── The PHONE ───────────────────────────────────────────────────────────
    let bestPhone: { line: Line; text: string; score: number } | null = null;
    lines.forEach(l => {
      if (FAX.test(l.text)) return;
      for (const v of variantsOf(l)) {
        // EVERY number on the line, not just the first: a title-block line
        // often prints the office number right before the customer's, and
        // stopping at the first match handed back our own number.
        const all = v.match(new RegExp(PHONE.source, 'g')) ?? [];
        let hitAny = false;
        for (const raw of all) {
          if (OWN_NUMBERS.has(normalizePhoneDigits(raw))) continue;   // the office calling itself
          // A sample number is never the customer's, even printed (a
          // template left unfilled says 050-1234567 as readily as a model).
          if (isPlaceholderPhone(raw)) continue;
          hitAny = true;
          let score = 50;
          if (PHONE_LABEL.test(v)) score += 50;
          else if (!inTitleBlock(l)) continue;   // a bare number out in the drawing is not the customer's
          // A mobile is almost always the CUSTOMER — the office and the
          // consultant print landlines.
          if (normalizePhoneDigits(raw).startsWith('05')) score += 15;
          score += titleBlockBonus(l);
          if (!bestPhone || score > bestPhone.score) bestPhone = { line: l, text: raw.trim(), score };
        }
        if (hitAny) break;
      }
    });

    /** Where the reader found it, for "the nearest of two printings" — PDF space. */
    const lineCentre = (l: Line, extra?: Line) => ({
      x: (Math.min(l.x1, extra?.x1 ?? l.x1) + Math.max(l.x2, extra?.x2 ?? l.x2)) / 2,
      y: (Math.min(l.y1, extra?.y1 ?? l.y1) + Math.max(l.y2, extra?.y2 ?? l.y2)) / 2,
    });

    // The local finds are matched back to the items that carry them — the
    // same locating the model's answers go through — and that is their box.
    // A find that cannot be placed is not offered: no location, no suggestion.
    let addr: Spot | null = null;
    let phone: Spot | null = null;
    const ba = bestAddr as { line: Line; extra?: Line; text: string } | null;
    const bp = bestPhone as { line: Line; text: string } | null;
    if (ba) {
      const at = locateWords(ba.text, segs, lineCentre(ba.line, ba.extra), 1);
      if (at && at !== 'office') addr = { value: ba.text, box: toFrac(at.rect), lineH: at.lineH, from: 'text' };
    }
    if (bp) {
      const at = locatePhone(normalizePhoneDigits(bp.text), segs, lineCentre(bp.line));
      if (at) phone = { value: bp.text, box: toFrac(at.rect), lineH: at.lineH, from: 'text' };
    }

    const out: PlanAddressResult = {};

    // THE AI READ (owner, 2026-09-07): when the server has a key, the whole
    // first page goes to a vision model, and a VERIFIED answer wins — a
    // heuristic over an arbitrary title block will always lose some of the
    // time, and the model reads the block the way a person does. Verified is
    // the 2026-10-05 rule: printed on THIS sheet, found where it is printed.
    let pageCanvas: HTMLCanvasElement | null = null;
    if (aiPlanReadingAvailable()) {
      try {
        const scale = Math.min(2, 1800 / Math.max(W1, H1));
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp } as never).promise;
          pageCanvas = canvas;
          // The title block again, enlarged — the small print a whole-page
          // picture shrinks to a few pixels.
          let detail: string | undefined;
          try {
            const ds = Math.min(4, 2400 / Math.max(W1, H1) * (landscape ? 1.6 : 1.4));
            const dvp = page.getViewport({ scale: ds });
            const dc = document.createElement('canvas');
            dc.width = Math.round(dvp.width); dc.height = Math.round(dvp.height);
            if (dc.width * dc.height <= 16_000_000) {
              const dctx = dc.getContext('2d');
              if (dctx) {
                dctx.fillStyle = '#fff'; dctx.fillRect(0, 0, dc.width, dc.height);
                await page.render({ canvasContext: dctx, viewport: dvp } as never).promise;
                detail = canvasToJpeg(dc, landscape ? { x0: 0.62, y0: 0, x1: 1, y1: 1 } : { x0: 0, y0: 0.68, x1: 1, y1: 1 }, 2400);
              }
              dc.width = 0; dc.height = 0;
            }
          } catch { /* the whole page alone */ }
          const ai = await aiReadPlanImage(canvasToJpeg(canvas, undefined, 1800), 'both', false,
            { scan: !hasText, detail, detailWhere: landscape ? 'right' : 'bottom' });
          if (ai) {
            out.ai = true;
            const aiAddr = tidy(ai.address);
            if (aiAddr && plausibleAddress(aiAddr) && !isOfficeAddress(aiAddr) && !unitLabelOnly(aiAddr)) {
              if (hasText) {
                const at = locateWords(aiAddr, segs, ai.addressBox ? toPdf(ai.addressBox) : null, 2);
                if (at && at !== 'office') addr = { value: aiAddr, box: toFrac(at.rect), lineH: at.lineH, from: 'ai' };
                else if (!at) {
                  const b = outlinedSpot(ai.addressBox, canvas);
                  if (b) addr = { value: aiAddr, box: b, lineH: 0, from: 'ai' };
                }
              } else {
                const b = usableBox(ai.addressBox);
                if (b && inkShare(canvas, b) >= MIN_INK) addr = { value: aiAddr, box: b, lineH: 0, from: 'ai' };
              }
            }
            const aiPhone = tidy(ai.phone);
            const digits = normalizePhoneDigits(aiPhone);
            if (aiPhone && digits.length >= 7 && digits.length <= 13
                && !OWN_NUMBERS.has(digits) && !isPlaceholderPhone(aiPhone)) {
              if (hasText) {
                const at = locatePhone(digits, segs, ai.phoneBox ? toPdf(ai.phoneBox) : null);
                if (at) phone = { value: aiPhone, box: toFrac(at.rect), lineH: at.lineH, from: 'ai' };
                else {
                  const b = outlinedSpot(ai.phoneBox, canvas);
                  if (b) phone = { value: aiPhone, box: b, lineH: 0, from: 'ai' };
                }
              } else {
                const b = usableBox(ai.phoneBox);
                if (b && inkShare(canvas, b) >= MIN_INK) phone = { value: aiPhone, box: b, lineH: 0, from: 'ai' };
              }
            }
            // The family name is checked the same way, or it is not kept.
            const fam = tidy(ai.family);
            const famAt = fam && hasText ? locateWords(fam, segs, null, 1) : null;
            if (famAt && famAt !== 'office') out.family = fam;
          }
        }
      } catch { /* the local read stands */ }
    }

    /**
     * The cutout: the value's box with generous surroundings — the label
     * beside or above it, the line under it — rendered at a scale that makes
     * the words genuinely readable; and where the value sits INSIDE that
     * picture, so the eye can draw the box on it. Never a strip of the whole
     * sheet: the width is capped around the value.
     */
    const cutoutOf = async (spot: Spot): Promise<{ image: string; inner: Frac } | null> => {
      const bw = (spot.box.x1 - spot.box.x0) * W1;
      const bh = (spot.box.y1 - spot.box.y0) * H1;
      const lh = Math.max(6, spot.lineH || bh);
      const padY = Math.max(lh * 1.6, 10);
      const padX = Math.max(60, bw * 0.35);
      let cx0 = spot.box.x0 * W1 - padX, cx1 = spot.box.x1 * W1 + padX;
      const cap = Math.max(bw + 40, 620);
      if (cx1 - cx0 > cap) {
        const mid = ((spot.box.x0 + spot.box.x1) / 2) * W1;
        cx0 = mid - cap / 2; cx1 = mid + cap / 2;
      }
      let cy0 = spot.box.y0 * H1 - padY, cy1 = spot.box.y1 * H1 + padY;
      cx0 = Math.max(0, cx0); cx1 = Math.min(W1, cx1);
      cy0 = Math.max(0, cy0); cy1 = Math.min(H1, cy1);
      const cw = cx1 - cx0, ch = cy1 - cy0;
      if (cw < 2 || ch < 2) return null;

      let scale = Math.min(8, Math.max(2, 1000 / cw));
      // A refused canvas is a blank cutout — cap the AREA, not just the scale.
      const MAX_AREA = 4_000_000;
      if (cw * ch * scale * scale > MAX_AREA) scale = Math.sqrt(MAX_AREA / (cw * ch));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(cw * scale));
      canvas.height = Math.max(1, Math.round(ch * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: ctx,
        viewport: vp,
        // Device-space shift so the crop lands at the canvas origin — the
        // standard pdf.js crop trick; a full-page render at this scale could be
        // a canvas the browser refuses.
        transform: [1, 0, 0, 1, -cx0 * scale, -cy0 * scale],
      } as never).promise;
      const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
      return {
        image: canvas.toDataURL('image/png'),
        inner: {
          x0: clamp01((spot.box.x0 * W1 - cx0) / cw), y0: clamp01((spot.box.y0 * H1 - cy0) / ch),
          x1: clamp01((spot.box.x1 * W1 - cx0) / cw), y1: clamp01((spot.box.y1 * H1 - cy0) / ch),
        },
      };
    };

    // No location, no suggestion: a value whose spot cannot be drawn is not offered.
    if (addr) {
      const c = await cutoutOf(addr).catch(() => null);
      if (c) {
        out.address = addr.value; out.cutout = c.image; out.cutoutBox = c.inner;
        out.addressBox = addr.box; out.addressFrom = addr.from;
      }
    }
    if (phone) {
      const c = await cutoutOf(phone).catch(() => null);
      if (c) {
        out.phone = phone.value; out.phoneCutout = c.image; out.phoneCutoutBox = c.inner;
        out.phoneBox = phone.box; out.phoneFrom = phone.from;
      }
    }

    if (!out.address && !out.phone) return { ...out, problem: hasText ? 'no-address' : 'no-text' };

    // The whole sheet, small — the eye frames WHERE on it the value was read.
    try {
      let src = pageCanvas;
      if (!src) {
        const scale = Math.min(1.5, 1000 / Math.max(W1, H1));
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp } as never).promise;
          src = canvas;
        }
      }
      if (src) out.sheet = canvasToJpeg(src, undefined, 1000);
    } catch { /* the cutout alone still frames the spot */ }

    return out;
  } finally {
    void doc.destroy().catch(() => {});
  }
}
