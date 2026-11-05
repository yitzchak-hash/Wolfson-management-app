/**
 * THE PRACTICE WORLD (owner, 2026-11-04: "create a lot of real/fake data
 * across every feature in the entire workspace, so testing will become a lot
 * easier").
 *
 * ONE made-up world, built from a fixed seed, so every run gives the same
 * people, customers, flats and jobs with the same ids. Two outputs come out of
 * it: `world` (plain JSON for the CRM loader to read, with stable ids that
 * link back to the app's records) and `docs` (the exact Firestore documents
 * the app reads, collection by collection).
 *
 * Nothing in here is real: names are put together from common first names
 * and surnames, every phone is in the fake 050-000-xxxx range, every email
 * ends in @practice.invalid, every Drive id starts with "practice-".
 *
 * Built with the app's OWN code (the default flats, the stage-mark writer,
 * the worker levels, the layout builder) so the shapes are exactly what the
 * app itself writes.
 */
import { buildDefaultApartments, buildNetivApartments, DEFAULT_BUILDINGS, NETIV_BUILDINGS, DEFAULT_PROJECTS } from '../../src/data/initialData';
import { applyMarks, marksForCurrent } from '../../src/data/stageMarks';
import { DEFAULT_WORKER_LEVELS } from '../../src/data/workerLevels';
import { DEFAULT_TIME_CLOCK } from '../../src/data/timeClock';
import { generateGrid, layoutToApartments } from '../../src/data/projectLayout';

type Rec = Record<string, any>;

// ── deterministic randomness ─────────────────────────────────────────────────
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(20261104);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
function weighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const token = (n = 24) => Array.from({ length: n }, () => ALNUM[Math.floor(rnd() * ALNUM.length)]).join('');

// ── dates (Israel's calendar day; Sun–Thu working week) ─────────────────────
const TZ = 'Asia/Jerusalem';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
let NOW = new Date();
const isoDay = (d: Date) => dayFmt.format(d);
const today = () => isoDay(NOW);
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const isWork = (day: string) => weekday(day) <= 4;
/** The n-th working day from today (0 = today or the next working day). */
function workDay(n: number): string {
  let d = today();
  if (n >= 0) {
    while (!isWork(d)) d = addDays(d, 1);
    for (let i = 0; i < n; i++) { d = addDays(d, 1); while (!isWork(d)) d = addDays(d, 1); }
  } else {
    for (let i = 0; i < -n; i++) { d = addDays(d, -1); while (!isWork(d)) d = addDays(d, -1); }
  }
  return d;
}
function workRun(start: string, count: number): string[] {
  const out: string[] = []; let d = start;
  while (out.length < count) { if (isWork(d)) out.push(d); d = addDays(d, 1); }
  return out;
}
/** An ISO instant on a given day at a local-ish hour (Israel is UTC+2/3; close enough for made-up data). */
const at = (day: string, hour = 9, min = 0) => new Date(`${day}T${String(hour - 2).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`).toISOString();
const daysAgoIso = (n: number, hour = 10) => at(addDays(today(), -n), hour, int(0, 59));

// ── name pools (common names put together at random, no real person) ─────
const FIRST_M = ['David', 'Moshe', 'Yosef', 'Avraham', 'Daniel', 'Itai', 'Noam', 'Eitan', 'Amir', 'Oren', 'Gilad', 'Yonatan', 'Ariel', 'Ronen', 'Shai', 'Erez', 'Tomer', 'Lior', 'Nadav', 'Yair', 'Omer', 'Elad', 'Asaf', 'Boaz', 'Chaim', 'Menachem', 'Shimon', 'Yehuda', 'Raz', 'Ido'];
const FIRST_F = ['Sarah', 'Rachel', 'Leah', 'Miriam', 'Noa', 'Tamar', 'Yael', 'Shira', 'Michal', 'Hila', 'Maya', 'Inbal', 'Keren', 'Orly', 'Dana', 'Liat', 'Efrat', 'Adi', 'Gali', 'Ronit', 'Hadas', 'Neta', 'Chen', 'Avital', 'Sigal'];
const LAST = ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Dahan', 'Avraham', 'Friedman', 'Azulay', 'Malka', 'Katz', 'Shapiro', 'Ben-David', 'Amar', 'Hadad', 'Ohana', 'Golan', 'Segal', 'Rosen', 'Weiss', 'Gabay', 'Elbaz', 'Halevi', 'Sasson', 'Tal', 'Barak', 'Nachum', 'Shalev', 'Carmel', 'Erez', 'Mor', 'Ziv', 'Navon', 'Yaron', 'Baruch', 'Gold', 'Stern', 'Klein', 'Harel', 'Ashkenazi', 'Yosef', 'Toledano', 'Vaknin', 'Avitan', 'Shitrit', 'Edri', 'Kadosh', 'Revivo', 'Sabag', 'Zohar'];
const HE_LAST: Record<string, string> = { Cohen: 'כהן', Levi: 'לוי', Mizrahi: 'מזרחי', Peretz: 'פרץ', Biton: 'ביטון', Dahan: 'דהן', Katz: 'כץ', Golan: 'גולן', Segal: 'סגל', Amar: 'עמר', Hadad: 'חדד', Ohana: 'אוחנה', Gabay: 'גבאי', Tal: 'טל', Barak: 'ברק', Harel: 'הראל', Zohar: 'זוהר', Malka: 'מלכה' };
const HE_FIRST: Record<string, string> = { David: 'דוד', Moshe: 'משה', Yosef: 'יוסף', Daniel: 'דניאל', Noam: 'נועם', Sarah: 'שרה', Rachel: 'רחל', Noa: 'נועה', Tamar: 'תמר', Yael: 'יעל', Shira: 'שירה', Michal: 'מיכל', Maya: 'מאיה', Amir: 'אמיר', Eitan: 'איתן' };
const CITIES = ['Tel Aviv', 'Ramat Gan', 'Givatayim', 'Petah Tikva', 'Holon', 'Bat Yam', 'Bnei Brak', 'Herzliya', "Ra'anana", 'Kfar Saba', 'Rishon LeZion', 'Netanya', 'Modiin', 'Jerusalem', 'Hod HaSharon', 'Rehovot', 'Or Yehuda', 'Kiryat Ono'];
const STREETS = ['Herzl', 'Rothschild', 'Jabotinsky', 'Ben Gurion', 'Weizmann', 'Bialik', 'Sokolov', 'Arlozorov', 'HaAtzmaut', 'Allenby', 'Dizengoff', "Ahad Ha'Am", 'Ibn Gabirol', 'Begin', 'HaNasi', 'Katznelson', 'Usishkin', 'Hertzog', 'Rabin', 'HaYarkon', 'Kaplan', 'Ha-Rav Kook', 'Shenkar', 'Moshe Dayan', 'HaPalmach', 'Ha-Histadrut', 'Yehuda HaLevi', 'Tchernichovsky', 'Bar Ilan', 'Golomb'];

let phoneSeq = 1000;
/** Every phone is in 050-000-xxxx, a range no Israeli carrier hands out. */
const fakePhone = () => `050-000-${String(phoneSeq++).padStart(4, '0')}`;
const fakeEmail = (first: string, last: string) => `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@practice.invalid';

// ── the people ───────────────────────────────────────────────────────────────
interface Person { id: string; first: string; last: string; name: string; phone: string; email: string }

function officeUsers() {
  const list: [string, string, string, string, string][] = [
    // id, first, last, role, code
    ['pu-admin', 'Avital', 'Ronen', 'Admin', '111111'],
    ['pu-sec', 'Shira', 'Golan', 'Coordinator', '222222'],
    ['pu-pm1', 'Eyal', 'Barak', 'Project Manager', '333333'],
    ['pu-pm2', 'Ronen', 'Tal', 'Project Manager', '444444'],
    ['pu-tech', 'Gilad', 'Mor', 'Technician', '555555'],
    ['pu-view', 'Michal', 'Segev', 'Viewer', '666666'],
  ];
  const colors = ['#1e3a5f', '#be185d', '#0d9488', '#7c3aed', '#ea580c', '#64748b'];
  return list.map(([id, first, last, role, code], i) => ({
    person: { id, first, last, name: `${first} ${last}`, phone: fakePhone(), email: fakeEmail(first, last) } as Person,
    doc: {
      id, name: `${first} ${last}`, role, code, active: true,
      createdAt: daysAgoIso(400 - i * 20), color: colors[i],
      ...(id === 'pu-sec' ? { answers: ['offList'] } : {}),
    },
  }));
}

function workers() {
  const list: [string, string, string, 'ac' | 'drywall' | 'general', 'en' | 'he' | 'ru', string][] = [
    ['pw-sergei', 'Sergei', 'Volkov', 'ac', 'ru', 'lvl-technician'],
    ['pw-dmitri', 'Dmitri', 'Orlov', 'ac', 'ru', 'lvl-contractor'],
    ['pw-alexei', 'Alexei', 'Petrov', 'ac', 'ru', 'lvl-contractor'],
    ['pw-igor', 'Igor', 'Kuznetsov', 'ac', 'ru', 'lvl-contractor'],
    ['pw-avi', 'Avi', 'Ben-Haim', 'ac', 'he', 'lvl-technician'],
    ['pw-moti', 'Moti', 'Azulay', 'ac', 'he', 'lvl-contractor'],
    ['pw-yossi', 'Yossi', 'Dahan', 'ac', 'he', 'lvl-contractor'],
    ['pw-khaled', 'Khaled', 'Nasser', 'ac', 'he', 'lvl-contractor'],
    ['pw-ahmad', 'Ahmad', 'Saleh', 'drywall', 'he', 'lvl-contractor'],
    ['pw-vasily', 'Vasily', 'Smirnov', 'drywall', 'ru', 'lvl-contractor'],
    ['pw-nikolai', 'Nikolai', 'Ivanov', 'drywall', 'ru', 'lvl-contractor'],
    ['pw-rami', 'Rami', 'Hadad', 'general', 'he', 'lvl-technician'],
    ['pw-eli', 'Eli', 'Shimoni', 'general', 'en', 'lvl-manager'],
    ['pw-oren', 'Oren', 'Katz', 'ac', 'en', 'lvl-technician'],
  ];
  const colors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#059669', '#b91c1c', '#7c2d12', '#0f766e', '#6d28d9'];
  return list.map(([id, first, last, category, lang, levelId], i) => ({
    person: { id, first, last, name: `${first} ${last}`, phone: fakePhone(), email: fakeEmail(first, last) } as Person,
    category, lang, levelId,
    doc: {
      id, name: `${first} ${last}`, email: fakeEmail(first, last), category, levelId,
      // S12: the same person's made-up id in Admin (core.people.id).
      corePersonId: `prac-person-${id.slice(3)}`,
      ...(lang !== 'en' ? { lang } : {}),
      color: colors[i], token: token(), active: true, createdAt: daysAgoIso(380 - i * 9),
      ...(i === 3 ? { notifyScope: 'near' } : {}),
      ...(i === 8 ? { photosOptional: true } : {}),
      ...(i === 10 ? { textScale: 1.25 } : {}),
    },
  }));
}

// ── stages ───────────────────────────────────────────────────────────────────
function stages() {
  const t0 = '2025-01-01T00:00:00.000Z';
  const B: Rec[] = [
    { id: 'm-ready', name: 'Ready to start', nameHe: 'מוכן להתחלה', nameRu: 'Готово к началу', color: '#94a3b8', order: 0, kind: 'marker' },
    { id: 's1', name: 'Piping', nameHe: 'צנרת', nameRu: 'Трубы', color: '#6366f1', order: 1, kind: 'work', trade: 'ac', includes: ['Soldering', 'Insulation', 'Pressure test'] },
    { id: 's2', name: 'Concealed Units Installed', nameHe: 'התקנת יחידות מוסתרות', nameRu: 'Скрытые блоки установлены', color: '#0ea5e9', order: 2, kind: 'work', trade: 'ac' },
    { id: 's3', name: 'Inline Fans Installed', nameHe: 'התקנת מפוחים', nameRu: 'Вентиляторы установлены', color: '#10b981', order: 3, kind: 'work', trade: 'ac' },
    { id: 's4', name: 'Wall Units Installed', nameHe: 'התקנת מזגנים עיליים', nameRu: 'Настенные блоки установлены', color: '#f59e0b', order: 4, kind: 'work', trade: 'ac' },
    { id: 's5', name: 'Outdoor Units Installed', nameHe: 'התקנת מעבים', nameRu: 'Наружные блоки установлены', color: '#ef4444', order: 5, kind: 'work', trade: 'ac', includes: ['Crane', 'Connections'] },
    { id: 's6', name: 'Thermostats & Haffala', nameHe: 'תרמוסטטים והפעלה', nameRu: 'Термостаты и запуск', color: '#8b5cf6', order: 6, kind: 'work', trade: 'general' },
    { id: 's7', name: 'Registers & Access Panels', nameHe: 'תריסים ופתחי שירות', nameRu: 'Решётки и люки', color: '#14b8a6', order: 7, kind: 'work', trade: 'drywall' },
    { id: 'm-done', name: 'Job completed', nameHe: 'העבודה הושלמה', nameRu: 'Работа завершена', color: '#16a34a', order: 99, kind: 'marker' },
  ];
  const G: Rec[] = [
    { id: 'gs-ready', name: 'Ready to start', nameHe: 'מוכן להתחלה', color: '#94a3b8', order: 1, kind: 'marker' },
    { id: 'gs-survey', name: 'Site survey', nameHe: 'סיור באתר', color: '#0ea5e9', order: 2, kind: 'work', trade: 'general' },
    { id: 'gs-quote', name: 'Quote sent', nameHe: 'הצעת מחיר נשלחה', color: '#a855f7', order: 3, kind: 'work', trade: 'general' },
    { id: 'gs-piping', name: 'Piping', nameHe: 'צנרת', nameRu: 'Трубы', color: '#6366f1', order: 4, kind: 'work', trade: 'ac' },
    { id: 'gs-drywall', name: 'Drywall closing', nameHe: 'סגירת גבס', nameRu: 'Гипсокартон', color: '#78716c', order: 5, kind: 'work', trade: 'drywall' },
    { id: 'gs-units', name: 'Units installed', nameHe: 'התקנת יחידות', nameRu: 'Блоки установлены', color: '#f59e0b', order: 6, kind: 'work', trade: 'ac' },
    { id: 'gs-comm', name: 'Commissioning', nameHe: 'הפעלה', nameRu: 'Запуск', color: '#8b5cf6', order: 7, kind: 'work', trade: 'ac' },
    { id: 'gs-done', name: 'Job completed', nameHe: 'העבודה הושלמה', nameRu: 'Работа завершена', color: '#16a34a', order: 8, kind: 'marker' },
  ];
  const stamp = (s: Rec, projectId?: string) => ({ ...s, active: true, ...(projectId ? { projectId } : {}), createdAt: t0, updatedAt: t0 });
  return { building: B.map(s => stamp(s)), general: G.map(s => stamp(s, 'general')) };
}

// ── helpers that write an apartment's stage the app's way ───────────────────
function setStage(apt: Rec, stageId: string | null, sorted: Rec[], extra?: Record<string, string>) {
  let marks = marksForCurrent(apt as any, stageId, sorted as any) as Record<string, string> | undefined;
  if (extra) marks = { ...(marks ?? {}), ...extra };
  Object.assign(apt, applyMarks(apt as any, marks as any, sorted as any));
  if (stageId) {
    const sd: Record<string, string> = {};
    for (const st of sorted) {
      if (st.order <= (sorted.find(s => s.id === stageId)?.order ?? 0)) sd[st.id] = daysAgoIso(int(5, 200));
    }
    apt.stageDates = sd;
  }
}

function noteEntry(id: string, text: string, by: Person, daysAgo: number, officeOnly = false) {
  return { id, text, at: daysAgoIso(daysAgo), by: by.id, byName: by.name, ...(officeOnly ? { officeOnly: true } : {}) };
}

const BUILDING_NOTES = [
  'Customer asked to move the thermostat next to the door.',
  'Keys are with the building manager on the ground floor.',
  'Parquet already laid. Cover the floor before drilling.',
  'Waiting for the electrician to bring power to the outdoor unit.',
  'Buyer added a concealed unit in the master bedroom (shinui).',
  'Drain line goes to the balcony, not the bathroom.',
  'Ceiling height 2.55, drop the drywall to 2.40 in the corridor.',
  'Customer works from home on Tuesdays, call before coming.',
  'Second access panel needed above the guest toilet.',
  'Outdoor unit on the roof, crane booked through the contractor.',
];
const JOB_NOTES = [
  'Wants a quote for 3 wall units and one concealed for the living room.',
  'Old system to be removed first. Ask about recycling.',
  'Gate code 4521#, parking in the back.',
  'Customer prefers Electra. Compare with Tadiran price.',
  'Second floor apartment, no elevator. Bring two people.',
  'Paid deposit. Balance on completion.',
  'Asked for the work to finish before the holidays.',
  'Architect sending the updated plan this week.',
  'Noise complaint from the neighbour last time, keep the compressor away from their window.',
  'VRF system, 6 indoor units. Plans in the Drive folder.',
];
const TASKS_BY_STAGE: Record<string, string[]> = {
  s1: ['Run copper pipes to all rooms', 'Finish piping and pressure test', 'Insulate the pipes in the ceiling'],
  s2: ['Hang the concealed unit in the corridor', 'Install concealed units', 'Connect the drain of the concealed unit'],
  s3: ['Install the inline fan in the bathroom', 'Fix the inline fan ducts'],
  s4: ['Mount the wall units in the bedrooms', 'Install wall unit in the children room'],
  s5: ['Place the outdoor units on the roof', 'Connect outdoor unit and vacuum the lines'],
  s6: ['Wire the thermostats and run the system', 'Haffala and check every room'],
  s7: ['Fit the registers and access panels', 'Close the access panels after the painter'],
  'gs-survey': ['Site survey and measurements', 'Measure the rooms and photograph the electric board'],
  'gs-quote': ['Prepare the quote after the survey'],
  'gs-piping': ['Piping for the whole apartment', 'Pre-piping before the plaster'],
  'gs-drywall': ['Close the drywall boxes around the ducts', 'Drywall drop ceiling in the corridor'],
  'gs-units': ['Install the units', 'Hang indoor units and set the outdoor unit'],
  'gs-comm': ['Start the system and teach the customer', 'Commissioning and remote setup'],
};
const MESSAGES_WORKER = ['On my way, 20 minutes.', 'Finished the bedroom, moving to the living room.', 'Missing two brackets, I will bring them tomorrow.', 'Customer not home, waiting outside.', 'Done. Photos uploaded.', 'The wall is concrete here, need a bigger drill.', 'Need the code for the parking.'];
const MESSAGES_OFFICE = ['Thanks! Please send photos when you finish.', 'The customer will be there after 10.', 'Bring the long ladder, high ceiling.', 'Can you also check the drain in the bathroom?', 'Great work, closing it.', 'Material is waiting at the warehouse.'];

// ── the world ────────────────────────────────────────────────────────────────
export interface BuildOptions { now?: Date; crmJobNumbers: string[] }

export function buildWorld(opts: BuildOptions) {
  rnd = mulberry32(20261104);
  phoneSeq = 1000;
  NOW = opts.now ?? new Date();
  const nowIso = NOW.toISOString();

  const users = officeUsers();
  const crew = workers();
  const admin = users[0].person, sec = users[1].person;
  const office = users.slice(0, 4).map(u => u.person);
  const workerById = new Map(crew.map(w => [w.person.id, w]));
  const acCrew = crew.filter(w => w.category === 'ac');
  const dryCrew = crew.filter(w => w.category === 'drywall');
  const genCrew = crew.filter(w => w.category === 'general');
  const crewFor = (trade?: string) => trade === 'drywall' ? dryCrew : trade === 'general' ? genCrew.concat(acCrew.slice(0, 2)) : acCrew;

  const st = stages();
  const sortedB = [...st.building].sort((a, b) => a.order - b.order);
  const sortedG = [...st.general].sort((a, b) => a.order - b.order);
  const workB = sortedB.filter(s => s.kind === 'work');
  const workG = sortedG.filter(s => s.kind === 'work');

  const customers: Rec[] = [];
  let custSeq = 0;
  function newCustomer(opts2: { city: string; street: string; houseNo: number; apt?: string; hebrew?: boolean; source: string }) {
    const female = chance(0.45);
    const first = female ? pick(FIRST_F) : pick(FIRST_M);
    const last = pick(LAST);
    const id = `cust-${String(++custSeq).padStart(4, '0')}`;
    const hebrew = !!opts2.hebrew && HE_LAST[last] && HE_FIRST[first];
    const c = {
      id, first, last,
      displayName: hebrew ? `${HE_LAST[last]}, ${HE_FIRST[first]}` : `${last}, ${first}`,
      phone: fakePhone(), email: fakeEmail(first, last),
      address: { street: opts2.street, houseNo: opts2.houseNo, apartment: opts2.apt ?? null, city: opts2.city, country: 'Israel' },
      addressLine: `${opts2.street} ${opts2.houseNo}${opts2.apt ? `/${opts2.apt}` : ''}, ${opts2.city}`,
      contacts: [] as Rec[],
      source: opts2.source,
      createdAt: daysAgoIso(int(30, 540)),
    };
    // A second contact on a third of them: a spouse, an architect, a project manager.
    if (chance(0.33)) {
      const role = pick(['Spouse', 'Architect', 'Interior designer', 'Building manager', 'Contractor']);
      const cf = pick(chance(0.5) ? FIRST_F : FIRST_M); const cl = role === 'Spouse' ? last : pick(LAST);
      c.contacts.push({ id: `${id}-c1`, name: `${cf} ${cl}`, role, phone: fakePhone(), email: fakeEmail(cf, cl) });
    }
    customers.push(c);
    return c;
  }

  // ── workspaces ─────────────────────────────────────────────────────────────
  const CUSTOM_ID = 'practice-heights';
  const customProject = { id: CUSTOM_ID, name: 'Practice Heights', shortName: 'Heights', nameHe: 'מגדלי האימון', shortNameHe: 'המגדלים', logoPath: '/general-logo.svg', type: 'building', color: '#7c3aed' };
  const workspaces = [...DEFAULT_PROJECTS.map(p => ({ ...p })), customProject];

  // Made-up addresses for the building projects (real street names, invented numbers).
  const SITE: Record<string, { street: string; houseNo: number; city: string }> = {
    wolfson: { street: 'HaShalom', houseNo: 71, city: 'Givatayim' },
    netiv: { street: 'Moshe Dayan', houseNo: 118, city: 'Tel Aviv' },
    [CUSTOM_ID]: { street: 'Jabotinsky', houseNo: 203, city: 'Ramat Gan' },
  };

  const docs: Record<string, Rec[]> = {};
  const put = (col: string, doc: Rec) => { (docs[col] ??= []).push(doc); };
  const colOf = (pid: string, base: string) => (pid === 'wolfson' ? base : `${pid}_${base}`);

  const flatsOut: Rec[] = [];
  const jobsOut: Rec[] = [];
  const tasksOut: Rec[] = [];
  const notesOut: Rec[] = [];
  const plansOut: Rec[] = [];

  // ── building flats ─────────────────────────────────────────────────────────
  // S12: every sold (named) flat carries its buyer's customer id and a job
  // number of its own. These numbers are made up (9001 and up, far from the
  // CRM's import); the job tiles below carry the CRM's 50 real-import numbers.
  // No random draw here, so the rest of the world is exactly as before.
  let flatJobSeq = 9000;
  function fillBuilding(pid: string, apts: Rec[], buildings: Rec[], tipusim: string[], customButtons: Rec[]) {
    const site = SITE[pid];
    for (const a of apts) {
      a.createdAt = '2025-01-01T00:00:00.000Z';
      if (a.isUnnamed) { a.updatedAt = a.createdAt; put(colOf(pid, 'apartments'), a); continue; }
      const cust = newCustomer({ ...site, apt: `${a.buildingId}-${a.apartmentNumber}`, source: pid });
      const named = chance(0.82);
      if (named) a.displayName = cust.last;
      if (chance(0.7)) a.phone = cust.phone;
      if (tipusim.length && chance(0.75)) a.tipus = pick(tipusim);
      if (chance(0.12)) a.classification = 'shinui';
      // Progress: towers move through the stages; a few are finished, a few untouched.
      const stageId = weighted<string | null>([
        [null, 10], ['s1', 14], ['s2', 14], ['s3', 10], ['s4', 12], ['s5', 12], ['s6', 10], ['s7', 8], ['m-done', 10],
      ]);
      const extra: Record<string, string> = {};
      if (stageId && stageId !== 'm-done' && chance(0.15)) {
        const later = workB.filter(s => s.order > (sortedB.find(x => x.id === stageId)?.order ?? 0));
        if (later.length) extra[pick(later).id] = 'pending';
      }
      if (chance(0.06)) extra['s3'] = 'off';
      setStage(a, stageId, sortedB, Object.keys(extra).length ? extra : undefined);
      if (customButtons.length) {
        a.customAnswers = Object.fromEntries(customButtons.map(b => [b.id, weighted([['yes', 5], ['no', 2], ['unknown', 3]] as [string, number][])]));
      }
      if (chance(0.25)) {
        const n = int(1, 3);
        a.noteEntries = Array.from({ length: n }, (_, i) => noteEntry(`NE-${a.id}-${i}`, pick(BUILDING_NOTES), pick(office), int(2, 120) - i, chance(0.2)));
        a.generalNotes = a.noteEntries.map((e: Rec) => e.text).join('\n');
      }
      if (chance(0.1)) a.plansPdfLink = `https://drive.google.com/file/d/practice-plan-${a.id}/view`;
      a.updatedAt = daysAgoIso(int(0, 60));
      a.contentUpdatedAt = a.updatedAt;
      a.updatedBy = pick(office).id; a.updatedByName = users.find(u => u.doc.id === a.updatedBy)!.doc.name;
      if (a.displayName) { a.jobNo = String(++flatJobSeq); a.crmCustomerId = cust.id; }
      put(colOf(pid, 'apartments'), a);
      flatsOut.push({
        id: a.id, workspace: pid, collection: colOf(pid, 'apartments'), buildingId: a.buildingId,
        jobNo: a.jobNo ?? null, crmCustomerId: a.crmCustomerId ?? null,
        number: a.apartmentNumber, floor: a.floor, tipus: a.tipus ?? null, customerId: cust.id,
        familyOnBoard: a.displayName, address: cust.addressLine, phone: a.phone ?? null,
        stage: a.currentStageId ? { id: a.currentStageId, name: sortedB.find(s => s.id === a.currentStageId)?.name } : null,
        shinui: a.classification === 'shinui',
      });
      (cust as Rec).links = [{ kind: 'flat', id: a.id, workspace: pid }];
    }
    return { pid, buildings };
  }

  const wolfsonApts = buildDefaultApartments() as Rec[];
  const netivApts = buildNetivApartments() as Rec[];
  const heightsLayout = { buildings: ['H1', 'H2'].map((bid, i) => generateGrid({ id: bid, name: `Tower ${bid}`, displayOrder: i + 1, floors: 9, perFloor: 4, startFloor: 1, numbering: { start: 1, direction: 'ltr', continueAcrossFloors: true } })) };
  const heightsApts = layoutToApartments(heightsLayout as any, []) as Rec[];
  const heightsBuildings = [{ id: 'H1', name: 'Tower H1', displayOrder: 1 }, { id: 'H2', name: 'Tower H2', displayOrder: 2 }];

  const wolfsonButtons = [{ id: 'cb-elec', name: 'Electric ready' }, { id: 'cb-paid', name: 'Upgrade paid' }];
  fillBuilding('wolfson', wolfsonApts, DEFAULT_BUILDINGS as Rec[], ['A2', 'B3', 'C1', 'D4', 'P1'], wolfsonButtons);
  fillBuilding('netiv', netivApts, NETIV_BUILDINGS as Rec[], ['N1', 'N2', 'Duplex'], []);
  fillBuilding(CUSTOM_ID, heightsApts, heightsBuildings, ['T1', 'T2'], []);

  // ── the Job Board ──────────────────────────────────────────────────────────
  const TILE_W = 215, TILE_H = 132, GAP = 22, PER_ROW = 8;
  const BOARD_TOP = 640;   // under the weekly notebook
  const bins: Rec[] = [
    { id: 'CE-bin-ready', binKind: 'ready', text: 'Ready to Start', color: '#0ea5e9' },
    { id: 'CE-bin-done', binKind: 'done', text: 'Done', color: '#16a34a' },
    { id: 'CE-bin-archive', binKind: 'archive', text: 'Archive', color: '#64748b' },
    { id: 'CE-bin-trash', binKind: 'trash', text: 'Trash', color: '#dc2626' },
    { id: 'CE-bin-newjobs', text: 'New Jobs Came In', color: '#64748b' },
    { id: 'CE-bin-parts', text: 'Waiting for parts', color: '#d97706' },
    { id: 'CE-bin-quotes', text: 'Quotes out', color: '#7c3aed' },
  ];
  const binKey = (b: Rec) => b.binKind ?? b.id;
  const crmSet = new Set(opts.crmJobNumbers);
  const jobNos: string[] = [...opts.crmJobNumbers];
  for (let n = 5330; jobNos.length < 220; n += int(1, 3)) if (!crmSet.has(String(n))) jobNos.push(String(n));
  for (let n = 2810; jobNos.length < 320; n += int(2, 9)) if (!crmSet.has(String(n))) jobNos.push(String(n));

  const generalApts: Rec[] = [];
  let boardSlot = 0;
  const binSlots: Record<string, number> = {};
  jobNos.forEach((jobNo, i) => {
    const city = pick(CITIES), street = pick(STREETS), houseNo = int(1, 140);
    const aptNo = chance(0.7) ? String(int(1, 40)) : undefined;
    const cust = newCustomer({ city, street, houseNo, apt: aptNo, hebrew: chance(0.15), source: 'general' });
    const n = Number(jobNo);
    const isCrm = crmSet.has(jobNo);
    // Older numbers sit in Done/Archive more often; the newest are leads and quotes.
    const where = n < 4000 && !isCrm
      ? weighted<string>([['done', 50], ['archive', 30], ['trash', 6], ['board', 14]])
      : n > 5500
        ? weighted<string>([['newjobs', 35], ['quotes', 20], ['board', 40], ['ready', 5]])
        : weighted<string>([['board', 62], ['ready', 8], ['parts', 8], ['done', 14], ['quotes', 5], ['archive', 3]]);
    const stageId = where === 'done' ? 'gs-done'
      : where === 'newjobs' ? null
      : where === 'quotes' ? 'gs-quote'
      : where === 'ready' ? 'gs-ready'
      : weighted<string | null>([[null, 4], ['gs-survey', 12], ['gs-quote', 10], ['gs-piping', 16], ['gs-drywall', 10], ['gs-units', 16], ['gs-comm', 10], ['gs-done', 4]]);
    const id = `G-prac-${jobNo}`;
    const created = daysAgoIso(n < 4000 ? int(300, 700) : n > 5500 ? int(1, 45) : int(30, 320));
    const a: Rec = {
      id, buildingId: 'G', apartmentNumber: '', displayName: cust.displayName,
      floor: 0, colPosition: 1, colSpan: 1, isDuplexApt: false, currentStageId: null,
      classification: 'standard', shinuiDetails: null, generalNotes: '', isUnnamed: false,
      driveFolderName: `${cust.displayName} - ${jobNo} - ${city}`,
      address: `${street} ${houseNo}${aptNo ? `/${aptNo}` : ''}, ${city}`,
      phone: cust.phone,
      createdAt: created, updatedAt: created, contentUpdatedAt: created,
      updatedBy: pick(office).id, updatedByName: '',
      // S12: the CRM's 50 jobs carry their number and customer; the rest are not the CRM's yet.
      ...(isCrm ? { jobNo, crmCustomerId: cust.id } : {}),
    };
    a.updatedByName = users.find(u => u.doc.id === a.updatedBy)!.doc.name;
    setStage(a, stageId, sortedG);
    if (chance(0.55)) a.generalNotes = pick(JOB_NOTES);
    if (chance(0.2)) {
      a.noteEntries = [noteEntry(`NE-${id}-0`, a.generalNotes || pick(JOB_NOTES), pick(office), int(3, 90)), noteEntry(`NE-${id}-1`, pick(JOB_NOTES), pick(office), int(0, 2))];
      a.generalNotes = a.noteEntries.map((e: Rec) => e.text).join('\n');
    }
    if (chance(0.12)) a.thumbsUp = int(1, 3);
    if (chance(0.04)) a.thumbsDown = 1;
    if (chance(0.08)) a.tileColor = pick(['#fef3c7', '#dcfce7', '#e0f2fe', '#fce7f3']);
    if (chance(0.05)) a.showOnTv = false;
    if (chance(0.06)) a.plansPdfLink = `https://drive.google.com/file/d/practice-plan-${id}/view`;
    if (where === 'board') {
      const s = boardSlot++;
      a.canvasX = GAP + (s % PER_ROW) * (TILE_W + GAP);
      a.canvasY = BOARD_TOP + Math.floor(s / PER_ROW) * (TILE_H + GAP);
    } else {
      const b = bins.find(x => binKey(x) === where || x.id === `CE-bin-${where}`)!;
      const k = binKey(b);
      const s = (binSlots[k] = (binSlots[k] ?? 0) + 1) - 1;
      a.boardBin = k; a.binnedAt = daysAgoIso(int(0, 200));
      a.binX = GAP + (s % 4) * (TILE_W + GAP); a.binY = GAP + Math.floor(s / 4) * (TILE_H + GAP);
      // Where it goes back to on the main board if taken out.
      a.canvasX = GAP + ((i * 7) % PER_ROW) * (TILE_W + GAP); a.canvasY = BOARD_TOP + 4000 + Math.floor(i / PER_ROW) * (TILE_H + GAP);
    }
    generalApts.push(a);
    put('general_apartments', a);
    (cust as Rec).links = [{ kind: 'job', id, workspace: 'general', jobNo }];
    jobsOut.push({
      id, jobNo, crmJob: isCrm, crmCustomerId: isCrm ? cust.id : null, workspace: 'general', collection: 'general_apartments', customerId: cust.id,
      title: cust.displayName, address: a.address, city, phone: cust.phone,
      stage: a.currentStageId ? { id: a.currentStageId, name: sortedG.find(s => s.id === a.currentStageId)?.name } : null,
      group: a.boardBin ? bins.find(b => binKey(b) === a.boardBin)?.text : null,
      notes: a.generalNotes || null, createdAt: created,
    });
  });

  // ── tasks, messages, stage notes ──────────────────────────────────────────
  let taskSeq = 0, noteSeq = 0, logSeq = 0;
  const logs: Record<string, Rec[]> = {};
  const addLog = (pid: string, l: Rec) => { (logs[pid] ??= []).push({ id: `AL-prac-${pid}-${++logSeq}`, ...l }); };

  function makeTask(pid: string, apt: Rec | null, opts3: { stage?: Rec; worker?: typeof crew[number]; when: 'done' | 'overdue' | 'today' | 'soon' | 'later'; text?: string; general?: Rec; problem?: boolean }) {
    const tradeCrew = crewFor(opts3.stage?.trade);
    const w = opts3.worker ?? pick(tradeCrew.length ? tradeCrew : acCrew);
    const by = pick(office);
    const id = `T-prac-${String(++taskSeq).padStart(4, '0')}`;
    const len = opts3.when === 'later' || opts3.when === 'soon' ? weighted([[1, 6], [2, 3], [3, 2]] as [number, number][]) : weighted([[1, 7], [2, 3]] as [number, number][]);
    const start = opts3.when === 'done' ? workDay(-int(3, 90))
      : opts3.when === 'overdue' ? workDay(-int(1, 12))
      : opts3.when === 'today' ? workDay(0)
      : opts3.when === 'soon' ? workDay(int(1, 6))
      : workDay(int(7, 25));
    const days = workRun(start, opts3.when === 'overdue' ? 1 : len);
    const created = at(addDays(days[0], -int(1, 14)), int(8, 17), int(0, 59));
    const t: Rec = {
      id, contractorId: w.person.id, apartmentId: apt?.id ?? '', buildingId: apt?.buildingId ?? (opts3.general?.buildingId ?? (pid === 'general' ? 'G' : '')),
      taskDescription: opts3.text ?? (opts3.stage ? pick(TASKS_BY_STAGE[opts3.stage.id] ?? ['General work']) : 'General work'),
      dueDate: days[days.length - 1], stageId: opts3.stage?.id ?? null,
      ...(opts3.stage ? { stageIds: [opts3.stage.id] } : {}),
      completedAt: opts3.when === 'done' ? at(days[days.length - 1], int(13, 18), int(0, 59)) : null,
      createdAt: created, createdBy: by.id, createdByName: by.name,
      priority: weighted([['normal', 7], ['urgent', 2], ['low', 1]] as [string, number][]),
      ...(days.length > 1 ? { days } : {}),
      plannedAt: created, plannedBy: by.name,
    };
    if (opts3.general) { t.general = opts3.general; t.apartmentId = ''; }
    if (opts3.problem) {
      t.problem = { photosRequired: chance(0.5), status: pick(['open', 'open', 'waiting', 'returned']), stageBefore: apt?.currentStageId ?? null,
        ...(chance(0.3) ? { returnNote: 'The leak is still there under the unit.', returnedAt: daysAgoIso(1) } : {}) };
      t.taskDescription = pick(['Water dripping from the concealed unit', 'Unit not cooling in the bedroom', 'Noise from the outdoor unit', 'Thermostat shows error E4', 'Bad smell from the vent']);
      delete t.days; t.dueDate = workDay(int(-2, 4)); t.priority = 'urgent'; t.completedAt = null;
    }
    if (opts3.stage && opts3.when === 'done' && chance(0.3)) t.stageWhenDone = null;
    put(colOf(pid, 'contractorAssignments'), t);
    tasksOut.push({
      id, workspace: pid, collection: colOf(pid, 'contractorAssignments'), workerId: w.person.id, worker: w.person.name,
      jobOrFlatId: t.apartmentId || null, text: t.taskDescription, stageId: t.stageId, days: t.days ?? [t.dueDate],
      dueDate: t.dueDate, status: t.problem ? `problem:${t.problem.status}` : t.completedAt ? 'done' : (t.dueDate < today() ? 'overdue' : t.dueDate === today() ? 'today' : 'open'),
      completedAt: t.completedAt, priority: t.priority, createdBy: by.name, createdAt: created,
    });
    // Messages on the task, both ways.
    if (chance(0.4) || t.problem) {
      const n = int(1, 3);
      for (let i = 0; i < n; i++) {
        const fromWorker = i % 2 === (chance(0.5) ? 0 : 1);
        const when = new Date(new Date(created).getTime() + (i + 1) * int(2, 30) * 3600_000).toISOString();
        const note = {
          id: `CN-prac-${++noteSeq}`, assignmentId: id, apartmentId: t.apartmentId, contractorId: w.person.id,
          text: fromWorker ? pick(MESSAGES_WORKER) : pick(MESSAGES_OFFICE),
          authorType: fromWorker ? 'contractor' : 'office', authorId: fromWorker ? w.person.id : by.id,
          authorName: fromWorker ? w.person.name : by.name, createdAt: when < nowIso ? when : nowIso,
        };
        put(colOf(pid, 'contractorNotes'), note);
        notesOut.push({ kind: 'task-message', id: note.id, workspace: pid, taskId: id, by: note.authorName, text: note.text, at: note.createdAt });
      }
    }
    if (apt) {
      addLog(pid, { userId: by.id, userName: by.name, buildingId: t.buildingId, apartmentId: apt.id, apartmentNumber: apt.displayName || apt.apartmentNumber || '', actionType: 'task_created', fieldChanged: 'task', previousValue: '', newValue: t.taskDescription, stageId: t.stageId ?? '', createdAt: created });
      if (t.completedAt) addLog(pid, { userId: w.person.id, userName: w.person.name, buildingId: t.buildingId, apartmentId: apt.id, apartmentNumber: apt.displayName || apt.apartmentNumber || '', actionType: 'task_completed', fieldChanged: 'task', previousValue: '', newValue: t.taskDescription, stageId: t.stageId ?? '', createdAt: t.completedAt });
    }
    return t;
  }

  function tasksForFlats(pid: string, apts: Rec[], sorted: Rec[], work: Rec[], rate: number) {
    for (const a of apts) {
      if (a.isUnnamed || !chance(rate)) continue;
      const curOrder = sorted.find(s => s.id === a.currentStageId)?.order ?? -1;
      const past = work.filter(s => s.order <= curOrder);
      const next = work.find(s => s.order > curOrder);
      if (past.length && chance(0.7)) makeTask(pid, a, { stage: pick(past), when: 'done' });
      if (next) makeTask(pid, a, { stage: next, when: weighted([['today', 2], ['soon', 5], ['later', 3], ['overdue', 2]] as [any, number][]) });
      if (chance(0.06)) makeTask(pid, a, { when: 'today', problem: true });
      // Stage notes, as bullets, on the stage that is being worked.
      if (chance(0.3) && (next || past.length)) {
        const stage = next ?? pick(past);
        const entries = Array.from({ length: int(1, 3) }, (_, i) => noteEntry(`SNE-${a.id}-${stage.id}-${i}`, pick(BUILDING_NOTES), pick(office), int(1, 60) - i, chance(0.15)));
        const sn = { id: `SN-${a.id}-${stage.id}`, apartmentId: a.id, stageId: stage.id, noteText: entries.map(e => e.text).join('\n'), entries, updatedAt: entries[entries.length - 1].at, updatedBy: entries[0].by, updatedByName: entries[0].byName };
        put(colOf(pid, 'stageNotes'), sn);
        notesOut.push({ kind: 'stage-note', id: sn.id, workspace: pid, flatId: a.id, stageId: stage.id, text: sn.noteText, at: sn.updatedAt });
      }
      if (a.currentStageId) addLog(pid, { userId: admin.id, userName: admin.name, buildingId: a.buildingId, apartmentId: a.id, apartmentNumber: a.displayName || a.apartmentNumber, actionType: 'stage_marks', fieldChanged: 'stageMarks', previousValue: '', newValue: `${sorted.find(s => s.id === a.currentStageId)?.name} done`, stageId: a.currentStageId, marks: [{ id: a.currentStageId, name: sorted.find(s => s.id === a.currentStageId)?.name ?? '', from: 'todo', to: 'done' }], createdAt: daysAgoIso(int(1, 40)) });
    }
  }
  tasksForFlats('wolfson', wolfsonApts, sortedB, workB, 0.55);
  tasksForFlats('netiv', netivApts, sortedB, workB, 0.55);
  tasksForFlats(CUSTOM_ID, heightsApts, sortedB, workB, 0.35);
  // Job Board tasks: the jobs on the board and the ready ones.
  for (const a of generalApts) {
    if (a.boardBin && !['CE-bin-parts', 'ready'].includes(a.boardBin) && a.boardBin !== 'done') continue;
    const curOrder = sortedG.find(s => s.id === a.currentStageId)?.order ?? 0;
    const next = workG.find(s => s.order > curOrder);
    const past = workG.filter(s => s.order <= curOrder);
    if (a.boardBin === 'done') { if (chance(0.5)) makeTask('general', a, { stage: pick(workG.slice(2)), when: 'done' }); continue; }
    if (past.length && chance(0.5)) makeTask('general', a, { stage: pick(past), when: 'done' });
    if (next && chance(0.85)) makeTask('general', a, { stage: next, when: weighted([['today', 2], ['soon', 5], ['later', 3], ['overdue', 2]] as [any, number][]) });
    if (chance(0.03)) makeTask('general', a, { when: 'soon', problem: true });
  }
  // General jobs: "Work at Wolfson" and friends, on no single flat.
  for (const [pid, name] of [['wolfson', 'Wolfson'], ['netiv', 'Netiv'], ['wolfson', 'Wolfson'], [CUSTOM_ID, 'Heights']] as const) {
    makeTask(pid, null, { when: 'soon', text: `Work at ${name}: close the snags list`, general: { projectId: pid } });
  }
  // Everybody has something today and tomorrow, so the notebook and the portal are never empty.
  for (const w of crew) {
    const flat = pick(wolfsonApts.filter(a => !a.isUnnamed));
    makeTask('wolfson', flat, { worker: w, when: 'today', stage: pick(workB) });
  }

  // ── stage suggestions (the worker's "not on the list") ────────────────────
  const suggestions = [
    ['Took out the old unit', 'wolfson'], ['Moved the electric socket', 'general'], ['Cleaned the site', 'netiv'],
    ['Changed the remote batteries', 'general'], ['Fixed the drain slope', 'wolfson'], ['Sealed the wall hole', 'netiv'],
  ].map(([text, pid], i) => ({
    id: `SS-prac-${i + 1}`, text, projectId: pid, contractorId: crew[i].person.id, by: crew[i].person.name,
    at: daysAgoIso(i * 3 + 1), status: i < 4 ? 'open' : i === 4 ? 'applied' : 'dismissed',
    ...(i === 4 ? { stageId: 's1', doneBy: sec.name, doneAt: daysAgoIso(1) } : {}),
  }));

  // ── employees and the time clock ──────────────────────────────────────────
  const employees = [...crew.slice(0, 8).map(w => w.person), sec, users[4].person].map((p, i) => ({
    id: `pe-${p.id.slice(3)}`, name: p.name, role: i < 8 ? 'Installer' : i === 8 ? 'Office' : 'Technician', active: true, sortOrder: i, createdAt: daysAgoIso(360),
  }));
  const punches: Rec[] = [];
  for (let back = 15; back >= 0; back--) {
    const day = workDay(-back);
    for (const e of employees) {
      if (chance(0.1)) continue; // a day off
      const inH = int(6, 8), inM = int(0, 59);
      punches.push({ id: `TP-${e.id}-${day}-in`, employeeId: e.id, day, at: at(day, inH, inM), kind: 'in', source: 'board' });
      if (back === 0) continue; // today: still on site
      const forgot = chance(0.05);
      punches.push({ id: `TP-${e.id}-${day}-out`, employeeId: e.id, day, at: at(day, forgot ? 17 : int(15, 18), forgot ? 0 : int(0, 59)), kind: 'out', source: forgot ? 'auto' : 'board', ...(forgot ? { auto: true } : {}) });
    }
  }

  // ── time off ──────────────────────────────────────────────────────────────
  const timeOff = [
    { w: 1, from: workDay(2), len: 3, kind: 'vacation', note: 'Family trip' },
    { w: 4, from: workDay(-1), len: 2, kind: 'sick' },
    { w: 6, from: workDay(8), len: 10, kind: 'reserve', note: 'Miluim' },
    { w: 9, from: workDay(0), len: 1, kind: 'other', note: 'Ministry of Interior appointment' },
    { w: 11, from: workDay(15), len: 5, kind: 'vacation' },
    { w: 2, from: workDay(-20), len: 4, kind: 'vacation', note: 'Eilat' },
  ].map((o, i) => {
    const days = workRun(o.from, o.len);
    return { id: `TO-prac-${i + 1}`, person: `c:${crew[o.w].person.id}`, from: days[0], to: days[days.length - 1], kind: o.kind, ...(o.note ? { note: o.note } : {}), by: sec.name, at: daysAgoIso(int(1, 10)) };
  });
  timeOff.push({ id: 'TO-prac-7', person: `u:${users[2].person.id}`, from: workDay(4), to: workDay(5), kind: 'vacation', by: admin.name, at: daysAgoIso(2) } as any);

  // ── plans: punch-list pins and markups (records only, no files) ─────────
  const planFlats = [...wolfsonApts, ...netivApts, ...generalApts].filter(a => a.plansPdfLink);
  const pins: Record<string, Rec[]> = {};
  const anns: Record<string, Rec[]> = {};
  planFlats.slice(0, 24).forEach((a, i) => {
    const pid = a.buildingId === 'G' ? 'general' : (a.buildingId.startsWith('B') ? 'netiv' : 'wolfson');
    for (let k = 0; k < int(1, 4); k++) {
      const pin: Rec = { id: `PP-prac-${i}-${k}`, apartmentId: a.id, xPct: int(10, 90), yPct: int(10, 90), text: pick(['Move the grille 20 cm left', 'Access panel here', 'Drain exits here', 'Thermostat at 1.5 m', 'Check the ceiling height']), createdAt: daysAgoIso(int(2, 60)), createdBy: pick(office).name };
      if (chance(0.35)) { pin.resolvedAt = daysAgoIso(1); pin.resolvedBy = pick(crew).person.name; }
      (pins[pid] ??= []).push(pin);
    }
    if (i < 8) {
      const strokes = Array.from({ length: int(2, 5) }, (_, s) => ({
        id: `S-${i}-${s}`, page: 0, tool: pick(['pen', 'marker', 'arrow', 'rect']), color: pick(['#dc2626', '#2563eb', '#16a34a']), width: 3, opacity: 1,
        pts: Array.from({ length: 6 }, (_, p) => [0.2 + rnd() * 0.6, 0.2 + rnd() * 0.6, 1][p % 3]).concat([0.5, 0.5, 1]),
      }));
      (anns[pid] ??= []).push({ id: `PA-prac-${i}`, apartmentId: a.id, planFileId: `practice-plan-${a.id}`, planName: `Plan ${a.displayName || a.apartmentNumber}.pdf`, version: 1, strokes, pageCount: 1, createdAt: daysAgoIso(int(3, 40)), createdBy: pick(office).name, note: 'Units and grilles marked for the crew' });
    }
    plansOut.push({ flatOrJobId: a.id, workspace: pid, planLink: a.plansPdfLink, pins: (pins[pid] ?? []).filter(p => p.apartmentId === a.id).length, markupVersions: (anns[pid] ?? []).filter(x => x.apartmentId === a.id).length });
  });
  for (const [pid, list] of Object.entries(pins)) list.forEach(p => put(colOf(pid, 'planPins'), p));
  for (const [pid, list] of Object.entries(anns)) list.forEach(p => put(colOf(pid, 'planAnnotations'), p));

  // ── the boards: groups, the weekly notebook, notes and widgets ────────────
  const ce = (pid: string, el: Rec) => put(colOf(pid, 'canvasElements'), { text: '', color: '#ffffff', addedAt: daysAgoIso(30), ...el });
  bins.forEach((b, i) => ce('general', { ...b, type: 'bin', x: GAP + PER_ROW * (TILE_W + GAP) + 40, y: BOARD_TOP + i * 104, w: 178, h: 92 }));

  // The weekly notebook: every worker a row, three weeks, written squares beside the task bars.
  const people = crew.map(w => `c:${w.person.id}`).concat([`u:${users[2].person.id}`, 'n:Crane company']);
  const firstWeek = (() => { let d = today(); while (weekday(d) !== 0) d = addDays(d, -1); return addDays(d, -7); })();
  const cells: Record<string, Rec[]> = {};
  const boardJobs = generalApts.filter(a => !a.boardBin);
  let cellSeq = 0;
  for (let k = 0; k < 40; k++) {
    const p = pick(people.slice(0, 14));
    const d = workDay(int(-4, 9));
    const key = `${p}|${d}`;
    (cells[key] ??= []).push(chance(0.6)
      ? { id: `R-prac${++cellSeq}`, at: daysAgoIso(int(0, 6)), text: pick(['Pick up material at 7:30', 'Meeting with the architect', 'Crane at 8 am', 'Warehouse day', 'Bring the vacuum pump', 'Call the customer first']) }
      : { id: `R-prac${++cellSeq}`, at: daysAgoIso(int(0, 6)), jobId: pick(boardJobs).id });
  }
  cells[`n:Crane company|${workDay(3)}`] = [{ id: 'R-prac-crane', text: 'Crane at Wolfson A2 roof, 7:00' }];
  const notebookEl = {
    id: 'CE-prac-notebook', type: 'widget', widget: 'rota', x: GAP, y: GAP, w: 1640, h: 560,
    data: { title: 'Weekly notebook', span: 5, weekStart: 0, people, cells, firstWeek, weekCount: 3, hebrew: true, holidays: { jewish: true, israeli: true }, askOnDrop: true, textSize: 11, dayNameSize: 11, stickies: { [`c:${crew[0].person.id}|${workDay(1)}`]: [{ id: 'st1', text: 'Bring the long ladder', colour: 'yellow' }] } },
  };
  ce('general', notebookEl);
  ce('general', { id: 'CE-prac-banner', type: 'widget', widget: 'banner', x: GAP + PER_ROW * (TILE_W + GAP) + 260, y: BOARD_TOP, w: 340, h: 62, text: 'PRACTICE BOARD', data: { text: 'PRACTICE BOARD' } });
  ce('general', { id: 'CE-prac-check', type: 'widget', widget: 'checklist', x: GAP + PER_ROW * (TILE_W + GAP) + 260, y: BOARD_TOP + 90, w: 215, h: 185, data: { title: 'This week', items: [{ t: 'Order 6 Electra units', done: true }, { t: 'Book crane for Netiv roof', done: false }, { t: 'Send quotes for new leads', done: false }, { t: 'Pay the drywall crew', done: true }] } });
  ce('general', { id: 'CE-prac-orders', type: 'widget', widget: 'order-list', x: GAP + PER_ROW * (TILE_W + GAP) + 500, y: BOARD_TOP + 90, w: 240, h: 185, data: { title: 'On order', items: [{ t: 'Condenser 5t', s: 1 }, { t: 'Copper pipe 1/2 x 30 m', s: 2 }, { t: 'Grilles 60x15 x 12', s: 0 }, { t: 'Thermostats x 8', s: 1 }] } });
  ce('general', { id: 'CE-prac-dates', type: 'widget', widget: 'milestones', x: GAP + PER_ROW * (TILE_W + GAP) + 260, y: BOARD_TOP + 300, w: 225, h: 165, data: { items: [{ t: 'Wolfson A1 handover', on: workDay(20) }, { t: 'Netiv B2 roof units', on: workDay(9) }, { t: 'Heights H1 start', on: workDay(30) }] } });
  ce('general', { id: 'CE-prac-contact', type: 'widget', widget: 'contact', x: GAP + PER_ROW * (TILE_W + GAP) + 500, y: BOARD_TOP + 300, w: 200, h: 115, data: { name: 'Crane company (practice)', role: 'Crane', phone: fakePhone() } });
  ce('general', { id: 'CE-prac-sticky', type: 'widget', widget: 'sticky-pad', x: GAP + PER_ROW * (TILE_W + GAP) + 740, y: BOARD_TOP + 90, w: 200, h: 180, data: { notes: [{ id: 'sp1', text: 'Shira: call the supplier about the late grilles', colour: 'yellow', updatedAt: daysAgoIso(1) }, { id: 'sp2', text: 'Remember the Netiv keys', colour: 'pink', updatedAt: daysAgoIso(0) }], openId: 'sp1' } });
  ['Customer called twice about the noise', 'Gali will send the plan tomorrow', 'Price list updated'].forEach((t, i) =>
    ce('general', { id: `CE-prac-note-${i}`, type: 'note', x: GAP + PER_ROW * (TILE_W + GAP) + 740 + i * 30, y: BOARD_TOP + 300 + i * 40, w: 165, h: 150, text: t, color: ['#fef08a', '#fbcfe8', '#bbf7d0'][i] }));
  ce('general', { id: 'CE-prac-title', type: 'title', x: GAP, y: BOARD_TOP - 52, w: 400, h: 44, text: 'Active jobs', color: '#1e3a5f', fontSize: 26, fontWeight: 700 });
  // Every workspace's dashboard: a few numbers and lists.
  for (const pid of ['wolfson', 'netiv', 'general', CUSTOM_ID]) {
    [['openTasks', 0], ['overdue', 1], ['dueToday', 2]].forEach(([metric, i]) =>
      ce(pid, { id: `CE-prac-dash-kpi-${metric}`, type: 'widget', widget: 'kpi', board: '__dashboard', x: (i as number) * 190, y: 380, w: 175, h: 105, z: (i as number) + 1, data: { metric } }));
    ce(pid, { id: 'CE-prac-dash-overdue', type: 'widget', widget: 'overdue-list', board: '__dashboard', x: 0, y: 500, w: 235, h: 175, z: 5, data: {} });
    ce(pid, { id: 'CE-prac-dash-due', type: 'widget', widget: 'due-today', board: '__dashboard', x: 250, y: 500, w: 230, h: 165, z: 6, data: {} });
    ce(pid, { id: 'CE-prac-dash-feed', type: 'widget', widget: 'activity-feed', board: '__dashboard', x: 500, y: 500, w: 235, h: 150, z: 7, data: {} });
  }
  // The wall's own dashboard.
  ce('general', { id: 'CE-prac-tv-clock', type: 'widget', widget: 'clock', board: '__tvdash', x: 0, y: 0, w: 190, h: 110, data: {} });
  ce('general', { id: 'CE-prac-tv-kpi', type: 'widget', widget: 'kpi', board: '__tvdash', x: 200, y: 0, w: 175, h: 105, data: { metric: 'openTasks' } });
  ce('general', { id: 'CE-prac-tv-late', type: 'widget', widget: 'overdue-list', board: '__tvdash', x: 0, y: 120, w: 235, h: 175, data: {} });

  // A second, named board on the Job Board.
  const boardViews = [
    { id: 'V-prac-office', projectId: 'general', name: "Shira's board", color: '#be185d', ownerId: sec.id, share: { [admin.id]: 'edit', [users[2].person.id]: 'view' }, userIds: [], createdAt: daysAgoIso(60), createdBy: sec.id },
  ];
  // A few jobs placed on it too.
  boardJobs.slice(0, 12).forEach((a, i) => { a.viewPos = { 'V-prac-office': { x: GAP + (i % 4) * (TILE_W + GAP), y: GAP + Math.floor(i / 4) * (TILE_H + GAP) } }; });

  // ── activity logs (newest 300 per workspace) ──────────────────────────────
  for (const [pid, list] of Object.entries(logs)) {
    list.filter(l => l.createdAt <= nowIso).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 300).forEach(l => put(colOf(pid, 'activityLogs'), l));
  }

  // ── the settings document ─────────────────────────────────────────────────
  const appSettings = {
    id: 'app',
    autoBackup: false, backupFrequency: 'daily', backupDriveFolderLink: '', driveExportFrequency: 'off', fullBackupEvery: 'night',
    customProjects: [customProject],
    projectOrder: ['general', 'wolfson', 'netiv', CUSTOM_ID],
    timeClock: DEFAULT_TIME_CLOCK,
    boardViews,
    boardSettings: {
      general: { autoJobs: { on: false, folders: [] }, viewMode: 'canvas', customButtons: [] },
      wolfson: { tipusim: ['A2', 'B3', 'C1', 'D4', 'P1'], customButtons: wolfsonButtons },
      netiv: { tipusim: ['N1', 'N2', 'Duplex'] },
      [CUSTOM_ID]: { tipusim: ['T1', 'T2'], buildings: heightsBuildings },
      __tv: { timeOff },
    },
  };

  // ── the global collections ────────────────────────────────────────────────
  for (const u of users) put('users', u.doc);
  for (const w of crew) put('contractors', w.doc);
  for (const s of [...st.building, ...st.general]) put('stages', s);
  for (const l of DEFAULT_WORKER_LEVELS as Rec[]) put('workerLevels', l);
  for (const e of employees) put('employees', e);
  for (const p of punches) put('timePunches', p);
  for (const s of suggestions) put('stageSuggestions', s);
  put('settings', appSettings);

  // ── the plain world, for the CRM loader ──────────────────────────────────
  const calendar = [
    ...tasksOut.filter(t => !String(t.status).startsWith('done') && t.status !== 'done').map(t => ({ kind: 'task', id: t.id, title: t.text, days: t.days, workerId: t.workerId, jobOrFlatId: t.jobOrFlatId, workspace: t.workspace })),
    ...timeOff.map(o => ({ kind: 'time-off', id: o.id, title: o.kind, from: o.from, to: o.to, person: o.person })),
    ...(notebookEl.data.cells ? [] : []),
    { kind: 'milestone', id: 'CE-prac-dates#1', title: 'Wolfson A1 handover', day: workDay(20) },
    { kind: 'milestone', id: 'CE-prac-dates#2', title: 'Netiv B2 roof units', day: workDay(9) },
    { kind: 'milestone', id: 'CE-prac-dates#3', title: 'Heights H1 start', day: workDay(30) },
  ];
  const notebook = Object.entries(cells).flatMap(([key, list]) => {
    const [person, day] = key.split('|');
    return list.map(e => ({ id: e.id, person, day, text: e.text ?? null, jobId: e.jobId ?? null }));
  });

  const world = {
    meta: {
      what: 'TzviAir practice world (made up, no real client data)',
      seed: 20261104, builtAt: nowIso, firebaseProject: 'wolfson-practice',
      phones: 'all in 050-000-xxxx', emails: 'all @practice.invalid',
      linking: 'every id here is the Firestore document id in wolfson-practice (collection given beside it)',
      keys: 'S12: jobNo and crmCustomerId (= customers[].id) on the 50 CRM job tiles and on every sold flat (flat numbers 9001 and up are made up); corePersonId on every worker',
    },
    people: {
      officeUsers: users.map(u => ({ ...u.person, role: u.doc.role, loginCode: u.doc.code, collection: 'users' })),
      workers: crew.map(w => ({ ...w.person, corePersonId: w.doc.corePersonId, trade: w.category, language: w.lang, level: w.levelId, portalPath: `/c/${w.doc.token}`, collection: 'contractors' })),
      employees: employees.map(e => ({ ...e, collection: 'employees' })),
    },
    customers,
    workspaces: workspaces.map(w => ({ id: w.id, name: w.name, nameHe: w.nameHe, type: w.type ?? 'building', site: SITE[w.id] ?? null })),
    buildings: [
      ...(DEFAULT_BUILDINGS as Rec[]).map(b => ({ ...b, workspace: 'wolfson' })),
      ...(NETIV_BUILDINGS as Rec[]).map(b => ({ ...b, workspace: 'netiv' })),
      ...heightsBuildings.map(b => ({ ...b, workspace: CUSTOM_ID })),
    ],
    stages: [...st.building, ...st.general].map(s => ({ id: s.id, name: s.name, nameHe: s.nameHe, order: s.order, kind: s.kind, scope: s.projectId ?? 'buildings' })),
    flats: flatsOut,
    jobs: jobsOut,
    tasks: tasksOut,
    notebook,
    calendar,
    plans: plansOut,
    notes: [
      ...notesOut,
      ...[...wolfsonApts, ...netivApts, ...heightsApts, ...generalApts].flatMap(a => (a.noteEntries ?? []).map((e: Rec) => ({ kind: 'general-note', id: e.id, flatOrJobId: a.id, by: e.byName, text: e.text, at: e.at }))),
    ],
    timeOff,
  };

  return { world, docs };
}
