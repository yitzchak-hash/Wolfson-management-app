/**
 * Hebrew dates and holidays, with no library.
 *
 * The browser already carries the Hebrew calendar — `Intl` with the `hebrew`
 * calendar turns 2 April 2026 into 15 Nisan 5786 — and a Jewish holiday is
 * *defined* as a Hebrew month and day. So the whole thing is a lookup against
 * what the platform already knows, rather than a dependency, a data file that
 * goes stale, or arithmetic of our own that would be wrong in a leap year.
 *
 * Verified against the real calendar while writing this:
 *   2 Apr 2026 → 15 Nisan (Pesach) · 2 Oct 2025 → 10 Tishri (Yom Kippur)
 *   3 Mar 2026 → 14 Adar (Purim)   · 15 Dec 2025 → 25 Kislev (Chanukah)
 *
 * A leap year splits Adar into "Adar I" and "Adar II"; Purim falls in Adar II
 * then, and Intl names them exactly that, so both spellings are matched.
 */

export type HolidayKind = 'jewish' | 'israeli' | 'secular';

export interface Holiday {
  name: string;
  nameHe: string;
  kind: HolidayKind;
  /** A day nobody is expected to be on site. */
  noWork?: boolean;
}

const HEB = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  day: 'numeric', month: 'long', year: 'numeric',
});

const HEB_HE = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' });

export interface HebrewDay { day: number; month: string; year: number }

/** The Hebrew day a civil date falls on. */
export function hebrewDay(d: Date): HebrewDay {
  const p = Object.fromEntries(HEB.formatToParts(d).map(x => [x.type, x.value]));
  return { day: Number(p.day), month: String(p.month), year: Number(String(p.year).replace(/\D/g, '')) };
}

/** "ט״ז אב" — the Hebrew date as Hebrew readers expect to see it. */
export function hebrewLabel(d: Date): string {
  return HEB_HE.format(d);
}

/**
 * The Adar that Purim falls in.
 *
 * A plain year has one "Adar"; a leap year splits it into "Adar I" and
 * "Adar II", and Purim is in the SECOND one. So the test is simply "Adar or
 * Adar II, never Adar I" — no leap-year calculation is needed at all.
 *
 * The first version of this did try to work out leapness, by scanning forward
 * for a month named "Adar I" — which walked straight into the FOLLOWING Hebrew
 * year and reported 5786 as a leap year because 5787 is one. Purim 2026 then
 * looked for Adar II on a date that was plainly 14 Adar, and vanished.
 */
const PURIM_ADAR = new Set(['Adar', 'Adar II']);

interface Rule {
  month: string | 'purim-adar';
  /** One day, or an inclusive span. */
  day: number | [number, number];
  name: string;
  nameHe: string;
  kind: HolidayKind;
  noWork?: boolean;
}

const RULES: Rule[] = [
  // ── The festivals ────────────────────────────────────────────────────────
  { month: 'Tishri', day: [1, 2],   name: 'Rosh Hashanah',   nameHe: 'ראש השנה',      kind: 'jewish', noWork: true },
  { month: 'Tishri', day: 3,        name: 'Fast of Gedaliah', nameHe: 'צום גדליה',    kind: 'jewish' },
  { month: 'Tishri', day: 10,       name: 'Yom Kippur',      nameHe: 'יום כיפור',     kind: 'jewish', noWork: true },
  { month: 'Tishri', day: [15, 21], name: 'Sukkot',          nameHe: 'סוכות',         kind: 'jewish', noWork: true },
  { month: 'Tishri', day: 22,       name: 'Simchat Torah',   nameHe: 'שמחת תורה',     kind: 'jewish', noWork: true },
  { month: 'Kislev', day: [25, 30], name: 'Chanukah',        nameHe: 'חנוכה',         kind: 'jewish' },
  { month: 'Tevet',  day: [1, 2],   name: 'Chanukah',        nameHe: 'חנוכה',         kind: 'jewish' },
  { month: 'Tevet',  day: 10,       name: 'Fast of Tevet',   nameHe: 'עשרה בטבת',     kind: 'jewish' },
  { month: 'Shevat', day: 15,       name: 'Tu BiShvat',      nameHe: 'ט״ו בשבט',      kind: 'jewish' },
  { month: 'purim-adar', day: 14,   name: 'Purim',           nameHe: 'פורים',         kind: 'jewish' },
  { month: 'purim-adar', day: 15,   name: 'Shushan Purim',   nameHe: 'שושן פורים',    kind: 'jewish' },
  { month: 'Nisan',  day: [15, 21], name: 'Pesach',          nameHe: 'פסח',           kind: 'jewish', noWork: true },
  { month: 'Iyar',   day: 18,       name: 'Lag BaOmer',      nameHe: 'ל״ג בעומר',     kind: 'jewish' },
  { month: 'Sivan',  day: 6,        name: 'Shavuot',         nameHe: 'שבועות',        kind: 'jewish', noWork: true },
  { month: 'Tamuz',  day: 17,       name: 'Fast of Tammuz',  nameHe: 'י״ז בתמוז',     kind: 'jewish' },
  { month: 'Av',     day: 9,        name: "Tisha B'Av",      nameHe: 'תשעה באב',      kind: 'jewish' },
  { month: 'Av',     day: 15,       name: "Tu B'Av",         nameHe: 'ט״ו באב',       kind: 'jewish' },

  // ── The national days ────────────────────────────────────────────────────
  // These move when the fixed date would fall badly — see shiftNational below.
  { month: 'Nisan', day: 27, name: 'Yom HaShoah',       nameHe: 'יום השואה',      kind: 'israeli' },
  { month: 'Iyar',  day: 4,  name: 'Yom HaZikaron',     nameHe: 'יום הזיכרון',    kind: 'israeli' },
  { month: 'Iyar',  day: 5,  name: 'Yom HaAtzmaut',     nameHe: 'יום העצמאות',    kind: 'israeli', noWork: true },
  { month: 'Iyar',  day: 28, name: 'Yom Yerushalayim',  nameHe: 'יום ירושלים',    kind: 'israeli' },
];

/** Fixed civil dates. Kept short — the ones an Israeli office actually notices. */
const SECULAR: { m: number; d: number; name: string; nameHe: string }[] = [
  { m: 1,  d: 1,  name: "New Year's Day", nameHe: 'ראש השנה האזרחית' },
  { m: 12, d: 25, name: 'Christmas',      nameHe: 'חג המולד' },
  { m: 12, d: 31, name: "New Year's Eve", nameHe: 'ערב ראש השנה האזרחית' },
];

/**
 * The national days shift so they do not clash with Shabbat.
 *
 * Yom HaZikaron and Yom HaAtzmaut move as a pair, and Yom HaShoah moves on its
 * own. These are the Knesset's rules, and skipping them would put the office's
 * memorial day on the wrong date roughly one year in two.
 */
function shiftNational(name: string, weekday: number): number {
  if (name === 'Yom HaShoah') {
    if (weekday === 5) return -1;             // Friday → back to Thursday
    if (weekday === 0) return 1;              // Sunday → on to Monday
    return 0;
  }
  if (name === 'Yom HaZikaron') {
    if (weekday === 4) return -1;             // Thursday → Wednesday
    if (weekday === 5) return -2;             // Friday   → Wednesday
    if (weekday === 0) return 1;              // Sunday   → Monday
    return 0;
  }
  if (name === 'Yom HaAtzmaut') {
    if (weekday === 5) return -1;             // Friday   → Thursday
    if (weekday === 6) return -2;             // Saturday → Thursday
    if (weekday === 1) return 1;              // Monday   → Tuesday
    return 0;
  }
  return 0;
}

const matches = (day: number, rule: number | [number, number]) =>
  Array.isArray(rule) ? day >= rule[0] && day <= rule[1] : day === rule;

/**
 * Every holiday falling on a civil date, filtered to the kinds you want on.
 *
 * Returns an array because days genuinely overlap — the first day of Chanukah
 * can be a Friday in Kislev, and Sukkot runs into Simchat Torah.
 */
export function holidaysOn(d: Date, kinds: {
  jewish?: boolean; israeli?: boolean; secular?: boolean;
}): Holiday[] {
  const out: Holiday[] = [];
  const heb = hebrewDay(d);

  for (const r of RULES) {
    if (r.kind === 'jewish' && !kinds.jewish) continue;
    if (r.kind === 'israeli' && !kinds.israeli) continue;

    const monthOk = (m: string) => (r.month === 'purim-adar' ? PURIM_ADAR.has(m) : m === r.month);

    if (r.kind === 'israeli') {
      // Work backwards: which Hebrew date, once shifted, lands on today?
      for (const probe of [-2, -1, 0, 1, 2]) {
        const at = new Date(d.getTime());
        at.setDate(at.getDate() - probe);
        const h = hebrewDay(at);
        if (!monthOk(h.month) || !matches(h.day, r.day)) continue;
        if (shiftNational(r.name, at.getDay()) === probe) {
          out.push({ name: r.name, nameHe: r.nameHe, kind: r.kind, noWork: r.noWork });
          break;
        }
      }
      continue;
    }

    if (monthOk(heb.month) && matches(heb.day, r.day)) {
      out.push({ name: r.name, nameHe: r.nameHe, kind: r.kind, noWork: r.noWork });
    }
  }

  if (kinds.secular) {
    for (const s of SECULAR) {
      if (d.getMonth() + 1 === s.m && d.getDate() === s.d) {
        out.push({ name: s.name, nameHe: s.nameHe, kind: 'secular' });
      }
    }
  }

  return out;
}
