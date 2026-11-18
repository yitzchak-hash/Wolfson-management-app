/**
 * NETIV FROM THE OFFICE SHEET (owner, 2026-11-18: "find the tipusim for Netiv … make sure that all the drive links
 * are updated in Netiv, as well as the Zoho links").
 *
 * Read once from "Netiv Neve Shamir 399 – Buyers, Upgrades & Payments" (Apartments tab, 17/11/2026): the Type
 * column, the "Customer folder (plans)" link and the "Open in Zoho" link of every flat. IDs only — no names, no
 * phones. Four sheet rows linked a plans sub-folder instead of the customer folder; those carry the customer folder
 * (the sub-folder's parent, or for B2 10 the customer's own folder found by name).
 *
 * Nothing here writes anything. The Data update screen (pages/DataUpdatePage.tsx) compares it with the live
 * records, shows every change, and writes only what the owner approves there.
 */

/** Every Netiv type, in the sheet's own order (ground, A line, B line, penthouses). */
export const NETIV_TIPUSIM = [
  'GR-4R', 'GR-5R', 'GR-6R',
  'A-3R', 'A-4R', 'A-5R', 'A-5R+',
  'B-3R', 'B-4R', 'B-5R', 'B-5R+',
  '7PH1', '6PH2', '6PH3',
] as const;

export interface NetivSheetRow {
  /** App apartment id: `${building}-${number}`, e.g. "B1-12". */
  id: string;
  tipus: string;
  /** Google Drive customer-folder id, when the sheet has one. */
  folder?: string;
  /** Zoho CRM deal (Potentials) id, when the sheet has one. */
  zoho?: string;
}

const Z = (tail: string) => `3058503000${tail}`;

/** Same layout in both buildings: 2–5 ground duplexes, 6–13 A line, 14–33 B line, 34–36 penthouses. */
const TYPE_BY_NUMBER: Record<number, string> = {
  2: 'GR-6R', 3: 'GR-5R', 4: 'GR-5R', 5: 'GR-6R',
  6: 'A-3R', 7: 'A-4R', 8: 'A-3R', 9: 'A-4R', 10: 'A-5R+', 11: 'A-5R', 12: 'A-3R', 13: 'A-4R',
  14: 'B-5R+', 15: 'B-5R', 16: 'B-3R', 17: 'B-4R', 18: 'B-5R+', 19: 'B-5R',
  20: 'B-3R', 21: 'B-4R', 22: 'B-5R+', 23: 'B-5R', 24: 'B-3R', 25: 'B-4R', 26: 'B-5R+', 27: 'B-5R',
  28: 'B-3R', 29: 'B-4R', 30: 'B-5R+', 31: 'B-5R', 32: 'B-3R', 33: 'B-4R',
  34: '7PH1', 35: '6PH2', 36: '6PH3',
};

/** Links per flat, from the sheet. A flat missing here has no folder / deal in the sheet (unsold or not contacted). */
const LINKS: Record<string, { folder?: string; zoho?: string }> = {
  'B1-2':  { folder: '13uPmvIzy6sAMO_-P-8CtiRRe-Zgnzyt6', zoho: Z('075973081') },
  'B1-4':  { folder: '1z5Zuw0T9jsCupBO9cIRZuLA8tGSqyeWA', zoho: Z('088364006') },
  'B1-7':  { folder: '1jU0Sq3aWpXI4UW9KGdrBJT_ac0MyE4m9', zoho: Z('081074439') },
  'B1-8':  { folder: '1LnenWsMxmSqi2anzhu0-zUFqbIynn4yf', zoho: Z('079152113') },
  'B1-9':  { folder: '1LnenWsMxmSqi2anzhu0-zUFqbIynn4yf', zoho: Z('079152113') },
  'B1-11': { folder: '1YxIs0A7n6quYSbbo5gMjowUSysvUf5PJ', zoho: Z('085646017') },
  'B1-12': { folder: '1f5RtiFMlJvamNkSPQP3VWE17M6tTmmJ1', zoho: Z('081777025') },
  'B1-14': { folder: '11YsX-GXjaoR6kBd56uHqbvhMmgGJsz-d', zoho: Z('085512190') },
  'B1-15': { folder: '1plZ5HSicx8gbmoXIgdMtv0_r_uAD6Ct0', zoho: Z('080265142') },
  'B1-16': { folder: '1ORYxiuE3kMFLYGmE0g3ZfPcUFsHwOMNm', zoho: Z('081669035') },
  'B1-17': { folder: '1dN6T5vt5EuCKLOpPHk5L2RgL8ftHGd1r', zoho: Z('082568035') },
  'B1-18': { folder: '1mOA7yKI6dmrZSz6PTsHl9m7ee472U-pd', zoho: Z('086353008') },
  'B1-19': { folder: '1jhvTmGJMLoKQT_NuBGUhJnBEMr63MWjj', zoho: Z('086613023') },
  'B1-21': { folder: '1F6pTEaoI4s27Jqg4TboXuDWpjR8GQbvc', zoho: Z('081777074') },
  'B1-22': { folder: '1teT9S6fZtbRJv2-KbxgMXhcJ8A0UKX8T', zoho: Z('088827025') },
  'B1-23': { folder: '1teT9S6fZtbRJv2-KbxgMXhcJ8A0UKX8T', zoho: Z('088827025') },
  'B1-36': { folder: '1_lTtbpP3RpQs7OeqDqL04AZhLIwxmp9a', zoho: Z('073476391') },
  'B2-1':  { folder: '1ZZpnS_hfPNDLP0-USkbWs2hymYJ3GkPQ', zoho: Z('073476837') },
  'B2-2':  { folder: '1RAgm9ULAO1QdeHi7QwvU1lm2LhB6f8uc', zoho: Z('071003307') },
  'B2-5':  { folder: '18vIBKkuCq9YfnV-vy3SJPSQhJdVikZ9V', zoho: Z('082129073') },
  'B2-6':  { folder: '14_cfP6issD_lb4Cmc8xDCYWWUQ_fWODu', zoho: Z('074509047') },
  'B2-7':  { folder: '1Z94UFQCqE0xGIeH6am6zK-nhQRbbKh-f', zoho: Z('073946178') },
  'B2-8':  { folder: '19bxN8PVjFDp3kiu4thwcTN_d86J-48k6', zoho: Z('077277539') },
  'B2-9':  { folder: '1dGVQ-vzlgO-tSfuthgvlcMvj1qE9LvET', zoho: Z('075649041') },
  'B2-10': { folder: '11THXbAubtAe2XPXaqxRgahTst6nfFtWM', zoho: Z('071918193') },
  'B2-11': { folder: '1rx1m8uIDkHGwILygioK2V3DEJcFjavui', zoho: Z('077277595') },
  'B2-12': { folder: '1Qa_8kIwOSeKPedjfBrnN9nsANY0C2Ntz', zoho: Z('080704028') },
  'B2-13': { folder: '11NlViY6TJD8WiIFg4gdrW_0wyhYypF62', zoho: Z('078820577') },
  'B2-14': { folder: '1rY5Eo086WZeiQZAvRu1p9c1K6ZMfBIU1', zoho: Z('074434111') },
  'B2-15': { folder: '1jA36YO09COpJBu5XakFgYVJqIc1Rlxg3', zoho: Z('077340419') },
  'B2-17': { folder: '18n_vwelOMw8LNOhUoH3nN1xHw1qE9Wxu', zoho: Z('073476919') },
  'B2-19': { folder: '105savsjzidGqEVsmJBVK9_GCiAvay36g', zoho: Z('085886081') },
  'B2-20': { folder: '17MzXA4vwkxcWdEBzVbje0o0HU1bVS8Ej', zoho: Z('078863895') },
  'B2-21': { folder: '17MzXA4vwkxcWdEBzVbje0o0HU1bVS8Ej', zoho: Z('078863895') },
  'B2-22': { folder: '1_BflR8XBrHOT99_07TWazZDmdWIwO1tl', zoho: Z('081692012') },
  'B2-25': { folder: '1rNSIKdYKkwb4tmHLxEE7gryzYK0iFL22', zoho: Z('074434238') },
  'B2-29': { folder: '1L-8dgG3EJ4-5xEz-0_alxfgneR5sXJtO', zoho: Z('080159097') },
  'B2-32': { folder: '118PcS4JWvGG9Dhv2TdzGK4J_x5qjFIzy', zoho: Z('082027039') },
  'B2-36': { folder: '1yup_DoeIOOayBkVdtt7Q9NK2p-RbNK-N', zoho: Z('073476743') },
};

function rowsFor(building: 'B1' | 'B2', numbers: number[]): NetivSheetRow[] {
  return numbers.map(n => {
    const id = `${building}-${n}`;
    // B2 1 is the one flat on the ground floor alone (GR-4R); B1 has no flat 1.
    const tipus = building === 'B2' && n === 1 ? 'GR-4R' : TYPE_BY_NUMBER[n];
    return { id, tipus, ...LINKS[id] };
  });
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** All 71 Netiv flats from the sheet: B1 2–36, B2 1–36. */
export const NETIV_SHEET: NetivSheetRow[] = [...rowsFor('B1', range(2, 36)), ...rowsFor('B2', range(1, 36))];

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const zohoDealUrl = (id: string) => `https://crm.zoho.com/crm/tab/Potentials/${id}`;
