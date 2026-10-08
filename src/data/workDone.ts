/**
 * WHO DID WHAT — finished work, said as sentences (owner, recording 2026-10-08).
 *
 * "In the order that it was done: 'Igor finished Drilling in apartment this
 * and that' — and then I should be able to click on the apartment … 'Max
 * finished drywall in here and here and here.' I want to see exactly what
 * was done, with pictures under it."
 *
 * The source of truth is the CLOSED TASK (`completedAt`) — a worker's stage
 * report and an ordinary task alike — and the pictures filed under it. The
 * activity log is deliberately NOT read: only the open workspace's log is
 * live on this machine, and a sentence that is true on one desk and missing
 * on another is worse than no sentence.
 *
 * One LINE per worker, per local day, per workspace, per WHAT:
 *  - a stage report / a task with stages → each stage it FINISHED
 *    (`stagesWorked` else `taskStageIds`, minus `stagesUnfinished`); the
 *    unfinished ones read "worked on X (not finished)";
 *  - a task with no stages → its own words;
 *  - a problem the worker fixed → "fixed a problem", its words beneath.
 * Lines are built per stage first and then lines with the SAME places are
 * merged ("finished Wall Units + Outdoor Units in 9, 10, 11"), so a worker
 * who reports two stages per flat reads as one sentence, and one who did
 * different stages in different flats reads as two.
 *
 * Pure — no store, no clock, no DOM: the records and `now` in, lines out.
 */
import type { Apartment, ContractorAssignment, ContractorPhoto, Contractor, Stage } from '../types';
import { generalBuildingsText } from '../types';
import { taskStageIds } from './stageMarks';
import { mediaKindOf } from './mediaKind';

export type WorkKind = 'done' | 'half' | 'task' | 'problem';

/** One workspace's records, as the widget hands them in. */
export interface WorkSource {
  projectId: string;
  assignments: ContractorAssignment[];
  apartments: Apartment[];
  photos: ContractorPhoto[];
}

/** A place the line names — an apartment (a link), or a general job's workspace (not one). */
export interface WorkPlace {
  aptId: string;
  buildingId: string;
  /** What the link says: the apartment's number, a board job's name. */
  label: string;
  /** The whole label, for the tooltip. */
  title: string;
  /** When the work there was closed, ISO — the line reads places in this order. */
  at: string;
}

export interface WorkLine {
  key: string;
  /** Local calendar day, yyyy-MM-dd. */
  day: string;
  contractorId: string;
  who: string;
  projectId: string;
  kind: WorkKind;
  /** done / half: the stages, in the stage list's order. */
  stageIds: string[];
  /** task / problem: the task's own words (distinct, joined by the widget). */
  words: string[];
  /** In the order the work was closed — earliest first, the sentence reads forward. */
  places: WorkPlace[];
  /** Oldest and newest close, ISO. */
  first: string;
  last: string;
  taskIds: string[];
  /** Pictures and films under the line's tasks, oldest first. */
  photos: ContractorPhoto[];
}

export interface WorkDay { day: string; lines: WorkLine[] }

export interface WorkOptions {
  now: number;
  /** The window, in days back from `now`. */
  days: number;
  /** One worker only; '' or absent = everybody. */
  contractorId?: string;
  /** Every stage the app knows (global + Job Board) — looked up by id only. */
  stages: Stage[];
  contractors: Contractor[];
  /** The name for a worker nobody can identify. */
  unknown?: string;
}

const DAY_MS = 86_400_000;

/** The local calendar day of a stamp, yyyy-MM-dd. */
export function localDay(t: number): string {
  const x = new Date(t);
  const m = x.getMonth() + 1, d = x.getDate();
  return `${x.getFullYear()}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}

/** When the work was really closed: a problem's own close, else the task's. */
function closedAtOf(t: ContractorAssignment): string | null {
  if (t.problem) return t.problem.closedAt || t.completedAt || null;
  return t.completedAt || null;
}

/** A picture or a film — never a document (`shotKindOf`'s rule: the record's type, else the NAME). */
function isShot(p: ContractorPhoto): boolean {
  if (p.fileType === 'file') return false;
  if (p.fileType === 'image' || p.fileType === 'video') return true;
  const k = mediaKindOf(p.filename, p.mimeType);
  if (k === 'image' || k === 'video') return true;
  return !p.mimeType;
}

/** A start-of-work task's own words carry nothing a sentence needs. */
const WORK_START = /^(?:(.+?)\s+—\s+)?(working here today|עובד כאן היום|работаю здесь сегодня)\s*$/i;
/** Two ways of typing the same words — case and spacing — are one thing done. */
const foldWords = (w: string) => w.toLowerCase().replace(/\s+/g, ' ').trim();
function wordsOf(t: ContractorAssignment): string {
  const w = (t.taskDescription ?? '').trim();
  return WORK_START.test(w) ? '' : w;
}

function placeOf(apt: Apartment | undefined, aptId: string, at: string, fallback: string): WorkPlace {
  if (!apt) return { aptId, buildingId: '', label: fallback, title: fallback, at };
  const num = apt.apartmentNumber?.trim() ?? '';
  const name = apt.displayName?.trim() ?? '';
  const board = apt.buildingId === 'G';
  const label = board ? (name || '?') : (num || name || '?');
  const title = num && name && name !== num ? `${num} — ${name}` : (num || name || '?');
  return { aptId: apt.id, buildingId: board ? '' : (apt.buildingId ?? ''), label, title, at };
}

interface Draft {
  day: string; contractorId: string; projectId: string; kind: WorkKind;
  stageIds: Set<string>; words: string[]; groupKey: string;
  places: Map<string, WorkPlace>; tasks: Map<string, ContractorAssignment>;
  first: string; last: string;
  /** The stages each task contributes to THIS line — the photo filter. */
  photos: ContractorPhoto[];
}

/**
 * Every finished piece of work in the window, as sentences, newest first.
 * `sources[0]`'s `projectId` is nothing special — every workspace is equal.
 */
export function workDone(sources: WorkSource[], opt: WorkOptions): WorkLine[] {
  const since = opt.now - Math.max(1, opt.days) * DAY_MS;
  const order = new Map(opt.stages.map(st => [st.id, st.order ?? 0]));
  const conName = new Map(opt.contractors.map(c => [c.id, c.name]));
  const drafts = new Map<string, Draft>();

  for (const src of sources) {
    const aptById = new Map(src.apartments.map(a => [a.id, a]));
    // Photos by task — one pass per workspace, never per line.
    const photosByTask = new Map<string, ContractorPhoto[]>();
    for (const p of src.photos) {
      if (!p.assignmentId || !isShot(p)) continue;
      const list = photosByTask.get(p.assignmentId);
      if (list) list.push(p); else photosByTask.set(p.assignmentId, [p]);
    }
    for (const t of src.assignments) {
      const at = closedAtOf(t);
      if (!at) continue;
      const ms = Date.parse(at);
      if (!Number.isFinite(ms) || ms < since || ms > opt.now + 60_000) continue;
      if (opt.contractorId && t.contractorId !== opt.contractorId) continue;
      // A general job closed by the office: its visits are stage reports of
      // their own and already say where the work was.
      if (t.general && (t.visits?.length ?? 0) > 0) continue;
      const day = localDay(ms);
      const apt = t.apartmentId ? aptById.get(t.apartmentId) : undefined;
      if (t.apartmentId && !apt) continue; // a task whose apartment is gone names nothing
      // A general job names its buildings, not a flat — a place, never a link.
      const place = placeOf(apt, t.apartmentId || `ws:${src.projectId}`, at, generalBuildingsText(t.general));
      const shots = photosByTask.get(t.id) ?? [];

      const add = (kind: WorkKind, groupKey: string, stageId: string | null, words: string) => {
        const key = `${t.contractorId}|${day}|${src.projectId}|${kind}|${groupKey}`;
        let dr = drafts.get(key);
        if (!dr) {
          dr = { day, contractorId: t.contractorId, projectId: src.projectId, kind,
            stageIds: new Set(), words: [], groupKey, places: new Map(), tasks: new Map(),
            first: at, last: at, photos: [] };
          drafts.set(key, dr);
        }
        if (stageId) dr.stageIds.add(stageId);
        if (words && !dr.words.some(w => foldWords(w) === foldWords(words))) dr.words.push(words);
        const pk = place.aptId;
        const had = dr.places.get(pk);
        if (!had || had.at > at) dr.places.set(pk, place);
        dr.tasks.set(t.id, t);
        if (at < dr.first) dr.first = at;
        if (at > dr.last) dr.last = at;
        // A picture tagged with a stage is evidence of THAT stage only.
        for (const p of shots) {
          if (stageId && p.stageId && p.stageId !== stageId) continue;
          if (!dr.photos.includes(p)) dr.photos.push(p);
        }
      };

      if (t.problem) { add('problem', '', null, wordsOf(t)); continue; }
      const worked = (t.stagesWorked?.length ? t.stagesWorked : taskStageIds(t)).filter(Boolean);
      if (!worked.length) {
        const w = wordsOf(t);
        add('task', foldWords(w), null, w);
        continue;
      }
      const unfinished = new Set(t.stagesFinished === false && !t.stagesUnfinished?.length
        ? worked : (t.stagesUnfinished ?? []));
      for (const sid of worked) {
        if (unfinished.has(sid)) add('half', sid, sid, '');
        else add('done', sid, sid, '');
      }
    }
  }

  // Merge stage lines that name exactly the same places — "finished Wall
  // Units + Outdoor Units in 9, 10, 11" rather than the same flats twice.
  const merged = new Map<string, Draft>();
  for (const dr of drafts.values()) {
    if (dr.kind !== 'done' && dr.kind !== 'half') { merged.set(`${dr.contractorId}|${dr.day}|${dr.projectId}|${dr.kind}|${dr.groupKey}`, dr); continue; }
    const placeKey = [...dr.places.keys()].sort().join(',');
    const key = `${dr.contractorId}|${dr.day}|${dr.projectId}|${dr.kind}|@${placeKey}`;
    const into = merged.get(key);
    if (!into) { merged.set(key, dr); continue; }
    dr.stageIds.forEach(id => into.stageIds.add(id));
    dr.tasks.forEach((t, id) => into.tasks.set(id, t));
    for (const p of dr.photos) if (!into.photos.includes(p)) into.photos.push(p);
    for (const [k, pl] of dr.places) { const had = into.places.get(k); if (!had || had.at > pl.at) into.places.set(k, pl); }
    if (dr.first < into.first) into.first = dr.first;
    if (dr.last > into.last) into.last = dr.last;
  }

  const out: WorkLine[] = [];
  for (const [key, dr] of merged) {
    out.push({
      key,
      day: dr.day,
      contractorId: dr.contractorId,
      who: conName.get(dr.contractorId) || opt.unknown || '',
      projectId: dr.projectId,
      kind: dr.kind,
      stageIds: [...dr.stageIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
      words: dr.words,
      places: [...dr.places.values()].sort((a, b) => a.at.localeCompare(b.at)),
      first: dr.first,
      last: dr.last,
      taskIds: [...dr.tasks.keys()],
      photos: [...dr.photos].sort((a, b) => (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? '')),
    });
  }
  // Newest first; a tie keeps a stable order (worker, then the key).
  out.sort((a, b) => b.last.localeCompare(a.last) || a.key.localeCompare(b.key));
  return out;
}

/** The lines under day headings, newest day first; inside a day, newest line first. */
export function byDay(lines: WorkLine[]): WorkDay[] {
  const days = new Map<string, WorkLine[]>();
  for (const l of lines) {
    const list = days.get(l.day);
    if (list) list.push(l); else days.set(l.day, [l]);
  }
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, ls]) => ({ day, lines: ls }));
}

/**
 * The places of a line, grouped by building in the order each building was
 * first met — "27, 26 · A2 · 9 · A3". A board job has no building.
 */
export function placesByBuilding(places: WorkPlace[]): { buildingId: string; places: WorkPlace[] }[] {
  const groups: { buildingId: string; places: WorkPlace[] }[] = [];
  for (const p of places) {
    const g = groups.find(x => x.buildingId === p.buildingId);
    if (g) g.places.push(p); else groups.push({ buildingId: p.buildingId, places: [p] });
  }
  return groups;
}

// ─── The shelf's canned week ─────────────────────────────────────────────────
/**
 * A busy week of finished work for the store's preview — the shelf makes no
 * store reads and no network calls, and a "nothing finished" card tells a
 * shopper nothing. Building units by NUMBER only (no family names), one
 * board job named by its street, pictures drawn as little SVG scenes.
 */
export const SAMPLE_WORK_STAGES: Stage[] = [
  { id: 'ws-drill', name: 'Drilling', nameHe: 'קידוחים', color: '#0891b2', order: 2, active: true },
  { id: 'ws-pipe', name: 'Piping', nameHe: 'צנרת', color: '#a3a3a3', order: 3, active: true },
  { id: 'ws-wall', name: 'Wall Units', nameHe: 'יחידות קיר', color: '#f59e0b', order: 6, active: true },
  { id: 'ws-out', name: 'Outdoor Units', nameHe: 'יחידות חוץ', color: '#d97706', order: 7, active: true },
  { id: 'ws-reg', name: 'Registers', nameHe: 'תריסים', color: '#84cc16', order: 8, active: true },
] as unknown as Stage[];

const scene = (sky: string, ground: string, block: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
       <rect width="120" height="120" fill="${sky}"/>
       <rect y="76" width="120" height="44" fill="${ground}"/>
       <rect x="16" y="28" width="38" height="48" fill="${block}"/>
       <rect x="62" y="46" width="42" height="30" fill="${block}" opacity=".7"/>
       <circle cx="98" cy="22" r="9" fill="#ffffff" opacity=".6"/>
     </svg>`);

export function sampleWork(contractors: Contractor[], now: number): { sources: WorkSource[]; contractors: Contractor[]; labels: Record<string, { label: string; color: string }> } {
  const people = contractors.length >= 3 ? contractors.slice(0, 3) : ([
    { id: 'sw-k1', name: 'Avi', category: 'drywall', token: 's1', active: true, createdAt: '' },
    { id: 'sw-k2', name: 'Moshe', category: 'ac', token: 's2', active: true, createdAt: '' },
    { id: 'sw-k3', name: 'Yoni', category: 'general', token: 's3', active: true, createdAt: '' },
  ] as unknown as Contractor[]);
  const [a, b, cc] = people.map(p => p.id);
  // Today's closes are hours BEFORE now (a clock time could lie in the
  // future); the earlier days are plain clock times.
  const at = (dayBack: number, h: number, m: number) => {
    if (dayBack === 0) return now - (h * 60 + m) * 60_000;
    const x = new Date(now - dayBack * DAY_MS); x.setHours(h, m, 0, 0);
    return x.getTime();
  };
  const iso = (t: number) => new Date(t).toISOString();
  const unit = (id: string, b: string, n: string): Apartment => ({ id, buildingId: b, apartmentNumber: n, displayName: '', floor: 3, isUnnamed: false } as unknown as Apartment);
  const wApts = [unit('sw-A2-25', 'A2', '25'), unit('sw-A2-26', 'A2', '26'), unit('sw-A2-27', 'A2', '27'), unit('sw-A2-28', 'A2', '28'),
    unit('sw-A3-9', 'A3', '9'), unit('sw-A3-10', 'A3', '10'), unit('sw-A3-11', 'A3', '11')];
  const nApts = [unit('sw-B1-12', 'B1', '12'), unit('sw-B1-14', 'B1', '14')];
  const gApts = [{ id: 'sw-G-1', buildingId: 'G', apartmentNumber: '', displayName: 'Herzl 3 — rooftop', floor: 0, isUnnamed: false } as unknown as Apartment];
  let n = 0;
  const task = (apt: string, who: string, t: number, f: Partial<ContractorAssignment>): ContractorAssignment => ({
    id: `sw-t${++n}`, apartmentId: apt, contractorId: who, taskDescription: '', dueDate: null, stageId: null,
    completedAt: iso(t), createdAt: iso(t - 3 * 3_600_000), createdBy: '', createdByName: '', buildingId: '', ...f,
  } as unknown as ContractorAssignment);
  const report = (apt: string, who: string, t: number, stages: string[], unfinished: string[] = []) =>
    task(apt, who, t, { stageReport: true, stageId: stages[0], stageIds: stages, stagesWorked: stages, stagesUnfinished: unfinished, taskDescription: 'working here today' });
  const wTasks = [
    report('sw-A2-27', a, at(0, 4, 40), ['ws-drill']),
    report('sw-A2-26', a, at(0, 3, 55), ['ws-drill']),
    report('sw-A2-25', a, at(0, 3, 5), ['ws-drill']),
    report('sw-A2-28', a, at(0, 2, 20), ['ws-drill']),
    report('sw-A3-9', b, at(1, 9, 15), ['ws-wall', 'ws-out']),
    report('sw-A3-10', b, at(1, 12, 30), ['ws-wall', 'ws-out']),
    report('sw-A3-11', b, at(1, 15, 10), ['ws-wall', 'ws-out']),
  ];
  // One finished, one left half done — the "(not finished)" sentence.
  const nTasks = [report('sw-B1-12', cc, at(2, 10, 0), ['ws-reg']), report('sw-B1-14', cc, at(2, 14, 45), ['ws-reg'], ['ws-reg'])];
  const gTasks = [task('sw-G-1', b, at(0, 1, 15), { taskDescription: 'Gas top-up and leak test' })];
  const colours: [string, string, string][] = [
    ['#bfdbfe', '#cbd5e1', '#64748b'], ['#bbf7d0', '#d1d5db', '#475569'], ['#fde68a', '#e2e8f0', '#78716c'],
    ['#fecaca', '#cbd5e1', '#57534e'], ['#ddd6fe', '#d1d5db', '#52525b'], ['#a5f3fc', '#e5e7eb', '#3f3f46'],
  ];
  let k = 0;
  const pics = (tasks: ContractorAssignment[], each: number): ContractorPhoto[] => tasks.flatMap(t => Array.from({ length: each }, (_, i) => {
    const c = colours[(k++) % colours.length];
    return { id: `sw-p${k}`, assignmentId: t.id, apartmentId: t.apartmentId, contractorId: t.contractorId,
      dataUrl: scene(c[0], c[1], c[2]), filename: `site-${k}.svg`, fileType: 'image',
      uploadedAt: new Date(Date.parse(t.completedAt!) - (each - i) * 6 * 60_000).toISOString() } as unknown as ContractorPhoto;
  }));
  return {
    contractors: people,
    sources: [
      { projectId: 'sample-w', apartments: wApts, assignments: wTasks, photos: pics(wTasks, 2) },
      { projectId: 'sample-n', apartments: nApts, assignments: nTasks, photos: pics(nTasks, 2) },
      { projectId: 'sample-g', apartments: gApts, assignments: gTasks, photos: pics(gTasks, 1) },
    ],
    labels: {
      'sample-w': { label: 'Wolfson', color: '#b8860b' },
      'sample-n': { label: 'Netiv', color: '#0d9488' },
      'sample-g': { label: 'Job Board', color: '#7c3aed' },
    },
  };
}
