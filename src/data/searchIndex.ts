/**
 * ONE search index for every search box in the app.
 *
 * Six places searched — the header, the search tile, the job list, the group
 * window, the wall's group window and the Find-a-job widget — and each had
 * its own hand-rolled scan with its own idea of what a job's text was, so a
 * word that lived only in the Drive folder title found the job in one box
 * and not the next (`docs/research/SEARCH.md`). This module is the one
 * answer: what is indexed, how a query is read, and how the hits are ranked.
 *
 *  · MiniSearch does the inverted index and the BM25 arithmetic; the tiers
 *    (starts-with, exact word, prefix, contains, digits, fuzzy, sounds-like)
 *    are decided here, a whole tier apart, because a fuzzy score cannot tell
 *    "Levine" (really starts with "lev") from "concealed" (one letter off).
 *  · Every text goes through `hebrewNormalize` on the way in AND on the way
 *    out — the same function on both sides, or a stored final letter never
 *    meets a typed one.
 *  · A workspace's index is kept between keystrokes and brought up to date
 *    record by record (`sync`), so the thousand-job board pays for its index
 *    once, not per letter typed.
 *  · A hit says WHY it matched (`why`) — the folder title, the phone, a memo's
 *    words — so a row whose title does not contain the query still explains
 *    itself.
 *
 * Nothing here touches the store, the clock (passed in as `now`) or the DOM,
 * so it is tested offline (`scratchpad/searchperf.mjs`, `hebnorm-test.mjs`).
 */

import MiniSearch, { SearchResult as MsResult, SearchOptions as MsOptions } from 'minisearch';
import {
  Apartment, ContractorAssignment, StageNote, ContractorNote, CanvasElement,
  PlanAnnotation, PlanPin, OfficeNoteFile, Contractor, Stage,
  aptLabel, binKeyOf, binLabelOf,
} from '../types';
import { normalizeText, tokenize, soundKeys, digitsOf } from './hebrewNormalize';
import { layoutSwap } from './translit';
import { isLiveProblem } from './problems';
import { readPicks, pickKey, pickWeight, pickedForQuery, type PickMemory } from './searchMemory';

// ───────────────────────────── public shapes ─────────────────────────────

export type SearchKind =
  | 'job' | 'task' | 'snote' | 'msg' | 'group' | 'node' | 'markup' | 'pin' | 'file'
  | 'worker' | 'stage';

/** The field a hit was found in, when the title itself does not say so. */
export type WhyField =
  | 'folder' | 'family' | 'first' | 'city' | 'num' | 'link' | 'address' | 'phone'
  | 'tipus' | 'unit' | 'who' | 'files' | 'words' | 'notes';

export type SearchTier = 'start' | 'exact' | 'prefix' | 'contains' | 'digits' | 'fuzzy' | 'sound';

export interface SearchHit<T = unknown> {
  /** `${kind}:${id}` — unique across kinds, the key learned picks use. */
  docId: string;
  kind: SearchKind;
  id: string;
  /** The apartment this belongs to, for everything that hangs off a job. */
  aptId?: string;
  rec: T;
  tier: SearchTier;
  /** Lower is better. The tier dominates; everything else moves inside it. */
  rank: number;
  /** Where the query was found, when the title alone would not explain the row. */
  why?: { field: WhyField; text: string; term: string };
  /** The group a job is filed in, when it is in one. */
  binLabel?: string;
}

/** Words that narrow the search rather than look for text. */
export interface SearchFilters {
  ws?: string;
  stage?: string;
  group?: string;
  worker?: string;
  problem?: boolean;
  pending?: boolean;
}

export interface WorkspaceSources {
  apartments: Apartment[];
  assignments?: ContractorAssignment[];
  stageNotes?: StageNote[];
  contractorNotes?: ContractorNote[];
  canvasElements?: CanvasElement[];
  planAnnotations?: PlanAnnotation[];
  planPins?: PlanPin[];
  officeNoteFiles?: OfficeNoteFile[];
  contractors?: Contractor[];
  stages?: Stage[];
  /** Widget id → the name people know it by. Passed in: widgets.tsx must not be imported here. */
  widgetNameOf?: (id: string) => string | undefined;
  /** A group window searching its OWN list wants its trashed jobs too. */
  includeTrash?: boolean;
}

export interface SearchOpts {
  kinds?: SearchKind[];
  /** Only jobs filed in this group (a group window's own list). */
  bin?: string;
  limit?: number;
  perKind?: number;
  /** Which workspace this index belongs to — the learned picks are keyed by it. */
  projectId?: string;
  /** Added to every rank — the caller's "open workspace first". */
  bias?: number;
  now?: number;
  /** Skip the learned picks (a shelf preview, a harness). */
  noPicks?: boolean;
}

// ───────────────────────────── the document ─────────────────────────────

const FIELDS = [
  'name', 'family', 'first', 'city', 'num', 'folder', 'address', 'phone', 'tipus',
  'unit', 'link', 'notes', 'who', 'files', 'words', 'sk',
] as const;
type Field = typeof FIELDS[number];
const MAIN_FIELDS: Field[] = FIELDS.filter(f => f !== 'sk');

/** How much a match in each field is worth against the same match elsewhere. */
const BOOST: Record<Field, number> = {
  name: 10, family: 8, first: 5, city: 5, num: 5, folder: 4, link: 6, unit: 4,
  address: 4, phone: 3, tipus: 3, who: 2, files: 2, words: 1, notes: 1, sk: 1,
};

/** Tiers a WHOLE tier apart: nothing inside a tier can climb into the one above. */
const TIER_BASE: Record<SearchTier, number> = {
  start: -200, exact: -100, prefix: 0, contains: 100, digits: 100, fuzzy: 200, sound: 300,
};

/** With the same quality of match, a job outranks a group, a group a worker, a stage comes last. */
const KIND_BIAS: Record<SearchKind, number> = {
  job: 0, group: 1, worker: 2, task: 3, node: 4, snote: 5, msg: 6, markup: 7, pin: 7, file: 7, stage: 8,
};

/** Which field explains a hit first, when several matched. */
const WHY_ORDER: WhyField[] = [
  'folder', 'family', 'first', 'city', 'num', 'link', 'address', 'phone', 'tipus', 'unit',
  'who', 'files', 'words', 'notes',
];
/** The folder title's pieces are shown as the folder title — that is what was typed. */
const WHY_SHOWN: Partial<Record<WhyField, Field>> = { family: 'folder', first: 'folder', city: 'folder', num: 'folder' };

interface Doc {
  id: string;
  kind: SearchKind;
  rid: string;
  aptId?: string;
  name: string; family: string; first: string; city: string; num: string; folder: string;
  address: string; phone: string; tipus: string; unit: string; link: string; notes: string;
  who: string; files: string; words: string; sk: string;
  /** Normalised title, for the starts-with tier. */
  nameT: string;
  /** Normalised everything (bar `sk`), for the contains tier. */
  hay: string;
  digits: string;
  // Side fields — filters read them, the index does not.
  bin?: string;
  binLabel?: string;
  stage?: string;
  workers?: string;
  problem?: boolean;
  pending?: boolean;
  when?: number;
  /** Content hash — `sync` replaces a doc only when this moved. */
  h: number;
  rec: unknown;
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

const FOLDER_ID_RE = /\/folders\/([A-Za-z0-9_-]{10,})|[?&]id=([A-Za-z0-9_-]{10,})/;
const FILE_ID_RE = /\/d\/([A-Za-z0-9_-]{10,})|[?&]id=([A-Za-z0-9_-]{10,})/;
const ZOHO_ID_RE = /(\d{8,})/;
const idIn = (re: RegExp, url?: string): string => {
  if (!url) return '';
  const m = url.match(re);
  return m ? (m[1] ?? m[2] ?? '') : '';
};

function blank(kind: SearchKind, rid: string, rec: unknown): Doc {
  return {
    id: `${kind}:${rid}`, kind, rid, rec,
    name: '', family: '', first: '', city: '', num: '', folder: '', address: '', phone: '',
    tipus: '', unit: '', link: '', notes: '', who: '', files: '', words: '', sk: '',
    nameT: '', hay: '', digits: '', h: 0,
  };
}

/** The folder title's pieces: "Cohen, David - 5555 - Ramat Gan" → family, first, num, city. */
function splitFolder(title: string): { family: string; first: string; num: string; city: string } {
  const segs = title.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  if (!segs.length) return { family: '', first: '', num: '', city: '' };
  const [head, ...rest] = segs;
  const comma = head.indexOf(',');
  const family = comma >= 0 ? head.slice(0, comma).trim() : head;
  const first = comma >= 0 ? head.slice(comma + 1).trim() : '';
  const num: string[] = [];
  const city: string[] = [];
  for (const seg of rest) {
    if (/\d/.test(seg) && seg.replace(/[\d\s\-()+/]/g, '').length <= 2) num.push(seg);
    else city.push(seg);
  }
  return { family, first, num: num.join(' '), city: city.join(' ') };
}

/** Compute the derived fields once the named ones are filled in. */
function finish(d: Doc): Doc {
  d.nameT = normalizeText(d.name).trim();
  const parts = [d.name, d.family, d.first, d.city, d.num, d.folder, d.address, d.phone, d.tipus,
    d.unit, d.link, d.notes, d.who, d.files, d.words];
  d.hay = normalizeText(parts.filter(Boolean).join('  '));
  d.digits = digitsOf(`${d.phone} ${d.folder} ${d.num} ${d.name} ${d.address}`);
  // Sound keys of every word of the NAMING fields — the fields a person would
  // spell in the other alphabet. Notes and memos are not transliterated.
  const sk = new Set<string>();
  for (const t of tokenize([d.name, d.family, d.first, d.city, d.folder, d.address, d.who].filter(Boolean).join(' '))) {
    if (/^\d+$/.test(t)) continue;
    for (const k of soundKeys(t)) if (k.length >= 2) sk.add(k);
  }
  d.sk = [...sk].join(' ');
  d.h = hash([d.hay, d.sk, d.bin ?? '', d.binLabel ?? '', d.stage ?? '', d.workers ?? '',
    d.problem ? 'p' : '', d.pending ? 'q' : '', String(d.when ?? '')].join(''));
  return d;
}

function stamp(iso?: string | null): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

function buildDocs(src: WorkspaceSources): Doc[] {
  const out: Doc[] = [];
  const stagesById = new Map((src.stages ?? []).map(s => [s.id, s]));
  const workersById = new Map((src.contractors ?? []).map(c => [c.id, c]));
  const bins = (src.canvasElements ?? []).filter(el => el.type === 'bin');
  const binLabel = new Map(bins.map(b => [binKeyOf(b), binLabelOf(b)]));
  const stageText = (id?: string | null): string => {
    const st = id ? stagesById.get(id) : undefined;
    return st ? normalizeText(`${st.name} ${st.nameHe ?? ''}`) : '';
  };

  const trashed = new Set<string>();
  const jobs = new Map<string, Apartment>();
  for (const a of src.apartments) {
    if (a.isUnnamed) continue;
    if (a.boardBin === 'trash' && !src.includeTrash) { trashed.add(a.id); continue; }
    jobs.set(a.id, a);
  }

  // Open tasks per job — who is on it, and is anything red.
  const openWorkers = new Map<string, Set<string>>();
  const redJobs = new Set<string>();
  for (const t of src.assignments ?? []) {
    if (!t.apartmentId || !jobs.has(t.apartmentId)) continue;
    if (isLiveProblem(t)) redJobs.add(t.apartmentId);
    if (t.completedAt) continue;
    const w = workersById.get(t.contractorId)?.name;
    if (!w) continue;
    if (!openWorkers.has(t.apartmentId)) openWorkers.set(t.apartmentId, new Set());
    openWorkers.get(t.apartmentId)!.add(w);
  }
  const filesByJob = new Map<string, OfficeNoteFile[]>();
  for (const f of src.officeNoteFiles ?? []) {
    if (!filesByJob.has(f.apartmentId)) filesByJob.set(f.apartmentId, []);
    filesByJob.get(f.apartmentId)!.push(f);
  }

  const jobSide = new Map<string, Pick<Doc, 'bin' | 'binLabel' | 'stage' | 'workers' | 'problem' | 'pending'>>();

  for (const a of jobs.values()) {
    const d = blank('job', a.id, a);
    d.aptId = a.id;
    const label = aptLabel(a);
    const display = (a.displayName ?? '').trim();
    d.name = [display, display !== label ? label : ''].filter(Boolean).join(' ');
    const folder = (a.driveFolderName ?? '').trim();
    d.folder = folder;
    if (folder) {
      const p = splitFolder(folder);
      d.family = p.family; d.first = p.first; d.city = p.city; d.num = p.num;
    }
    const num = (a.apartmentNumber ?? '').trim();
    if (num) d.num = [d.num, num].filter(Boolean).join(' ');
    d.address = a.address ?? '';
    d.phone = a.phone ? `${a.phone} ${digitsOf(a.phone)}` : '';
    d.tipus = a.tipus ?? '';
    if (a.buildingId && a.buildingId !== 'G') {
      const b = a.buildingId;
      d.unit = [b, num, num ? `${b}${num}` : '', num ? `apt${num}` : '', a.floor ? `floor${a.floor}` : '']
        .filter(Boolean).join(' ');
    }
    d.link = [idIn(FOLDER_ID_RE, a.driveLink), idIn(FILE_ID_RE, a.plansPdfLink), idIn(ZOHO_ID_RE, a.zohoLink)]
      .filter(Boolean).join(' ');
    d.notes = a.noteEntries?.length ? a.noteEntries.map(e => e.text).join('\n') : (a.generalNotes ?? '');
    const who = new Set<string>();
    a.noteEntries?.forEach(e => { if (e.byName) who.add(e.byName); });
    openWorkers.get(a.id)?.forEach(w => who.add(w));
    d.who = [...who].join(' ');
    const files = filesByJob.get(a.id) ?? [];
    d.files = files.map(f => f.filename).filter(Boolean).join(' ');
    d.words = files.map(f => f.transcript ?? '').filter(Boolean).join(' ');
    d.bin = a.boardBin || undefined;
    d.binLabel = a.boardBin ? (binLabel.get(a.boardBin) ?? a.boardBin) : undefined;
    d.stage = stageText(a.currentStageId);
    d.workers = normalizeText([...(openWorkers.get(a.id) ?? [])].join(' '));
    d.problem = redJobs.has(a.id);
    d.pending = !!a.stageMarks && Object.values(a.stageMarks).includes('pending');
    d.when = stamp(a.contentUpdatedAt) ?? stamp(a.updatedAt) ?? stamp(a.createdAt);
    jobSide.set(a.id, { bin: d.bin, binLabel: d.binLabel, stage: d.stage, workers: d.workers, problem: d.problem, pending: d.pending });
    out.push(finish(d));
  }

  const inherit = (d: Doc, aptId?: string) => {
    const s = aptId ? jobSide.get(aptId) : undefined;
    if (!s) return;
    d.bin = s.bin; d.binLabel = s.binLabel; d.stage = s.stage;
    d.workers = s.workers; d.problem = s.problem; d.pending = s.pending;
  };
  const liveApt = (id?: string) => !id || (!trashed.has(id) && (jobs.has(id) || !src.apartments.some(a => a.id === id)));

  for (const t of src.assignments ?? []) {
    if (t.apartmentId && trashed.has(t.apartmentId)) continue;
    if (t.apartmentId && !liveApt(t.apartmentId)) continue;
    const d = blank('task', t.id, t);
    d.aptId = t.apartmentId || undefined;
    d.name = t.taskDescription ?? '';
    const w = workersById.get(t.contractorId)?.name ?? '';
    d.who = w;
    d.files = (t.attachments ?? []).map(x => x.filename).filter(Boolean).join(' ');
    d.words = (t.attachments ?? []).map(x => x.transcript ?? '').filter(Boolean).join(' ');
    inherit(d, t.apartmentId);
    if (isLiveProblem(t)) d.problem = true;
    if (t.stageId) d.stage = stageText(t.stageId) || d.stage;
    if (w) d.workers = normalizeText(w);
    d.when = stamp(t.completedAt) ?? stamp(t.createdAt);
    out.push(finish(d));
  }

  for (const n of src.stageNotes ?? []) {
    if (trashed.has(n.apartmentId) || !liveApt(n.apartmentId)) continue;
    const text = n.entries?.length ? n.entries.map(e => e.text).join('\n') : (n.noteText ?? '');
    const atts = [...(n.attachments ?? []), ...(n.entries ?? []).flatMap(e => e.attachments ?? [])];
    if (!text.trim() && !atts.length) continue;
    const d = blank('snote', n.id, n);
    d.aptId = n.apartmentId;
    d.name = text;
    d.who = [...new Set([n.updatedByName, ...(n.entries ?? []).map(e => e.byName)].filter(Boolean))].join(' ');
    d.files = [n.attachmentFilename ?? '', ...atts.map(x => x.filename)].filter(Boolean).join(' ');
    d.words = atts.map(x => x.transcript ?? '').filter(Boolean).join(' ');
    inherit(d, n.apartmentId);
    d.stage = stageText(n.stageId) || d.stage;
    d.when = stamp(n.updatedAt);
    out.push(finish(d));
  }

  for (const m of src.contractorNotes ?? []) {
    if (trashed.has(m.apartmentId) || !liveApt(m.apartmentId)) continue;
    if (!(m.text ?? '').trim() && !m.attachmentFilename && !m.transcript) continue;
    const d = blank('msg', m.id, m);
    d.aptId = m.apartmentId;
    d.name = m.text ?? '';
    d.who = m.authorName ?? '';
    d.files = m.attachmentFilename ?? '';
    d.words = m.transcript ?? '';
    inherit(d, m.apartmentId);
    d.when = stamp(m.createdAt);
    out.push(finish(d));
  }

  for (const el of src.canvasElements ?? []) {
    if (el.type === 'bin') {
      const d = blank('group', el.id, el);
      d.name = binLabelOf(el);
      d.bin = binKeyOf(el);
      d.binLabel = d.name;
      out.push(finish(d));
      continue;
    }
    if (el.type === 'stroke' || el.type === 'arrow') continue;
    const dataWords = el.data
      ? Object.values(el.data).filter((v): v is string => typeof v === 'string' && v.length < 400).join(' ')
      : '';
    const text = `${el.text ?? ''} ${el.docName ?? ''}`.trim();
    if (!text && !dataWords.trim()) continue;
    const d = blank('node', el.id, el);
    d.name = text;
    d.notes = el.widget ? (src.widgetNameOf?.(el.widget) ?? el.widget) : el.type;
    d.words = dataWords;
    if (el.board) { d.bin = el.board; d.binLabel = binLabel.get(el.board) ?? el.board; }
    out.push(finish(d));
  }

  for (const m of src.planAnnotations ?? []) {
    if (trashed.has(m.apartmentId) || !liveApt(m.apartmentId)) continue;
    const d = blank('markup', m.id, m);
    d.aptId = m.apartmentId;
    d.name = `${m.planName ?? ''} version ${m.version}`.trim();
    d.who = m.createdBy ?? '';
    d.notes = m.note ?? '';
    d.link = m.driveFileId ?? '';
    inherit(d, m.apartmentId);
    d.when = stamp(m.createdAt);
    out.push(finish(d));
  }

  for (const p of src.planPins ?? []) {
    if (trashed.has(p.apartmentId) || !liveApt(p.apartmentId)) continue;
    if (!(p.text ?? '').trim() && !p.audioTranscript && !p.files?.length) continue;
    const d = blank('pin', p.id, p);
    d.aptId = p.apartmentId;
    d.name = p.text ?? '';
    d.words = p.audioTranscript ?? '';
    d.files = (p.files ?? []).map(f => f.filename).filter(Boolean).join(' ');
    d.who = p.createdBy ?? '';
    inherit(d, p.apartmentId);
    d.when = stamp(p.resolvedAt) ?? stamp(p.createdAt);
    out.push(finish(d));
  }

  for (const f of src.officeNoteFiles ?? []) {
    if (trashed.has(f.apartmentId) || !liveApt(f.apartmentId)) continue;
    const d = blank('file', f.id, f);
    d.aptId = f.apartmentId;
    d.name = f.filename ?? '';
    d.words = f.transcript ?? '';
    d.who = f.uploadedByName ?? '';
    inherit(d, f.apartmentId);
    d.when = stamp(f.uploadedAt);
    out.push(finish(d));
  }

  return out;
}

/** Workers and stages are global — one small index shared by every workspace. */
function buildGlobalDocs(contractors: Contractor[], stages: Stage[]): Doc[] {
  const out: Doc[] = [];
  for (const c of contractors) {
    if (!c.active) continue;
    const d = blank('worker', c.id, c);
    d.name = c.name ?? '';
    d.notes = `${c.category ?? ''} ${c.email ?? ''}`.trim();
    d.workers = normalizeText(c.name ?? '');
    out.push(finish(d));
  }
  for (const st of stages) {
    if (!st.active) continue;
    const d = blank('stage', st.id, st);
    d.name = `${st.name} ${st.nameHe ?? ''}`.trim();
    d.notes = st.description ?? '';
    d.stage = normalizeText(d.name);
    out.push(finish(d));
  }
  return out;
}

// ───────────────────────────── the index ─────────────────────────────

export interface Index {
  ms: MiniSearch<Doc>;
  docs: Map<string, Doc>;
  sigs: unknown[];
}

function newMini(): MiniSearch<Doc> {
  return new MiniSearch<Doc>({
    fields: [...FIELDS],
    storeFields: ['kind'],
    idField: 'id',
    tokenize: (text, field) => field === 'sk' ? text.split(' ').filter(Boolean) : tokenize(text),
    processTerm: t => t,
  });
}

/** Bring an index up to date with a fresh doc list, touching only what moved. */
function sync(index: Index, fresh: Doc[]) {
  const seen = new Set<string>();
  for (const d of fresh) {
    seen.add(d.id);
    const old = index.docs.get(d.id);
    if (!old) { index.ms.add(d); index.docs.set(d.id, d); continue; }
    if (old.h !== d.h) { index.ms.replace(d); }
    // Same content, maybe a new record object — keep the newest one on hand.
    index.docs.set(d.id, d);
  }
  for (const id of [...index.docs.keys()]) {
    if (seen.has(id)) continue;
    index.ms.discard(id);
    index.docs.delete(id);
  }
}

const CACHE = new Map<string, Index>();

function sigsOf(src: WorkspaceSources): unknown[] {
  return [src.apartments, src.assignments, src.stageNotes, src.contractorNotes, src.canvasElements,
    src.planAnnotations, src.planPins, src.officeNoteFiles, src.contractors, src.stages, !!src.includeTrash];
}
const sameSigs = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The index for one workspace, kept between calls under `key` and brought up
 * to date only when one of the source arrays is a new object.
 */
export function workspaceIndex(key: string, src: WorkspaceSources): Index {
  const sigs = sigsOf(src);
  let index = CACHE.get(key);
  if (index && sameSigs(index.sigs, sigs)) return index;
  if (!index) {
    index = { ms: newMini(), docs: new Map(), sigs };
    CACHE.set(key, index);
  }
  sync(index, buildDocs(src));
  index.sigs = sigs;
  return index;
}

/** Forget a workspace's index (a harness, or a workspace deleted). */
export function dropIndex(key: string) { CACHE.delete(key); }

const ADHOC = new WeakMap<Apartment[], Index>();

/**
 * An index over ONE list of jobs — a group window's list, a widget's jobs, the
 * job list page's filtered units. Keyed by the array itself, so a memoised
 * list is indexed once and a new list once more.
 */
export function jobsIndex(jobs: Apartment[], stages?: Stage[], includeTrash = true): Index {
  let index = ADHOC.get(jobs);
  if (index) return index;
  index = { ms: newMini(), docs: new Map(), sigs: [] };
  const docs = buildDocs({ apartments: jobs, stages, includeTrash });
  index.ms.addAll(docs);
  docs.forEach(d => index!.docs.set(d.id, d));
  ADHOC.set(jobs, index);
  return index;
}

const GLOBAL_KEY = '__global';
export function globalIndex(contractors: Contractor[], stages: Stage[]): Index {
  const sigs = [contractors, stages];
  let index = CACHE.get(GLOBAL_KEY);
  if (index && sameSigs(index.sigs, sigs)) return index;
  if (!index) { index = { ms: newMini(), docs: new Map(), sigs }; CACHE.set(GLOBAL_KEY, index); }
  sync(index, buildGlobalDocs(contractors, stages));
  index.sigs = sigs;
  return index;
}

// ───────────────────────────── the query ─────────────────────────────

export interface ParsedQuery { text: string; filters: SearchFilters }

const FILTER_WORDS: Record<string, 'stage' | 'group' | 'worker' | 'ws'> = {
  stage: 'stage', 'שלב': 'stage',
  group: 'group', in: 'group', 'קבוצה': 'group',
  worker: 'worker', who: 'worker', 'עובד': 'worker',
  ws: 'ws', workspace: 'ws', 'סביבה': 'ws',
};
const FLAG_WORDS: Record<string, 'problem' | 'pending'> = {
  problem: 'problem', problems: 'problem', 'בעיה': 'problem', 'בעיות': 'problem',
  pending: 'pending', 'ממתין': 'pending',
};

/**
 * Read the filter words out of a query: `stage:piping`, `group:done`,
 * `worker:moshe`, `ws:netiv`, `is:problem`, `is:pending` (Hebrew twins too).
 * Everything else is the text. A bare word like "problem" stays text — a job
 * may well be called that.
 */
export function parseQuery(raw: string): ParsedQuery {
  const filters: SearchFilters = {};
  const rest: string[] = [];
  for (const word of raw.trim().split(/\s+/)) {
    if (!word) continue;
    const m = word.match(/^([^\s:]+):(.*)$/u);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].toLowerCase();
      if (key === 'is' && FLAG_WORDS[val]) { filters[FLAG_WORDS[val]] = true; continue; }
      const f = FILTER_WORDS[key];
      if (f && val) { filters[f] = normalizeText(val); continue; }
    }
    rest.push(word);
  }
  return { text: rest.join(' '), filters };
}

export function hasFilters(f: SearchFilters): boolean {
  return !!(f.ws || f.stage || f.group || f.worker || f.problem || f.pending);
}

/** Does a `ws:` filter name this workspace? By id or by a prefix of its name. */
export function wsMatches(filter: SearchFilters, project: { id: string; name: string }): boolean {
  if (!filter.ws) return true;
  const w = filter.ws;
  return project.id.toLowerCase().startsWith(w) || normalizeText(project.name).startsWith(w)
    || normalizeText(project.name).split(/\s+/).some(t => t.startsWith(w));
}

/** Is there enough typed to search for? Two characters, or a filter word. */
export function queryIsEnough(raw: string): boolean {
  const p = parseQuery(raw);
  return normalizeText(p.text).trim().length >= 2 || hasFilters(p.filters);
}

// ───────────────────────────── the search ─────────────────────────────

function passes(d: Doc, f: SearchFilters, opts: SearchOpts, kinds?: Set<SearchKind>): boolean {
  if (kinds && !kinds.has(d.kind)) return false;
  if (opts.bin !== undefined && d.bin !== opts.bin) return false;
  if (f.stage && !(d.stage ?? '').split(/\s+/).some(t => t.startsWith(f.stage!))) return false;
  if (f.group) {
    // "group:done" means the JOBS in Done, never the Done group itself.
    if (d.kind === 'group') return false;
    const lab = normalizeText(d.binLabel ?? '');
    const key = (d.bin ?? '').toLowerCase();
    if (!lab.startsWith(f.group) && !lab.split(/\s+/).some(t => t.startsWith(f.group!)) && !key.startsWith(f.group)) return false;
  }
  if (f.worker && !(d.workers ?? '').split(/\s+/).some(t => t.startsWith(f.worker!))) return false;
  if (f.problem && !d.problem) return false;
  if (f.pending && !d.pending) return false;
  return true;
}

function whyOf(d: Doc, fields: Set<string>, term: string): SearchHit['why'] {
  if (fields.has('name')) return undefined;
  for (const f of WHY_ORDER) {
    if (!fields.has(f)) continue;
    const shown = WHY_SHOWN[f] ?? f;
    const text = (d as unknown as Record<string, string>)[shown] ?? '';
    if (!text) continue;
    return { field: f, text: text.length > 90 ? text.slice(0, 88) + '…' : text, term };
  }
  return undefined;
}

/** Which field CONTAINS the word — for the contains and digits tiers, where MiniSearch has no match map. */
function whyContains(d: Doc, word: string): SearchHit['why'] {
  if (normalizeText(d.name).includes(word)) return undefined;
  for (const f of WHY_ORDER) {
    const raw = (d as unknown as Record<string, string>)[f] ?? '';
    if (!raw) continue;
    if (normalizeText(raw).includes(word)) {
      const shown = (d as unknown as Record<string, string>)[WHY_SHOWN[f] ?? f] || raw;
      return { field: f, text: shown.length > 90 ? shown.slice(0, 88) + '…' : shown, term: word };
    }
  }
  return undefined;
}

interface Found { tier: SearchTier; rel: number; why?: SearchHit['why'] }

const better = (a: Found | undefined, b: Found): boolean =>
  !a || TIER_BASE[b.tier] < TIER_BASE[a.tier] || (TIER_BASE[b.tier] === TIER_BASE[a.tier] && b.rel > a.rel);

export function searchIndex(index: Index, rawQuery: string, opts: SearchOpts = {}): SearchHit[] {
  const { text, filters } = parseQuery(rawQuery);
  const kinds = opts.kinds ? new Set(opts.kinds) : undefined;
  const pass = (d: Doc) => passes(d, filters, opts, kinds);
  const q = normalizeText(text).trim();
  const now = opts.now ?? Date.now();
  const found = new Map<string, Found>();

  if (q.length < 2) {
    if (!hasFilters(filters) && opts.bin === undefined) return [];
    // Filters alone: everything that passes, newest first.
    for (const d of index.docs.values()) if (pass(d)) found.set(d.id, { tier: 'exact', rel: 0 });
  } else {
    const words = q.split(/\s+/).filter(Boolean);
    const swapped = normalizeText(layoutSwap(text)).trim();
    const variants = [q];
    if (swapped !== q && swapped.replace(/[^\p{L}]/gu, '').length >= 2) variants.push(swapped);
    const short = q.length < 3;
    const digitsOnly = /^\d+$/.test(q);

    for (const v of variants) {
      const vWords = v.split(/\s+/).filter(Boolean);
      const ms: MsOptions = {
        fields: digitsOnly && short ? ['unit', 'num', 'name'] : MAIN_FIELDS,
        prefix: !(digitsOnly && short),
        fuzzy: short ? false : (term => term.length >= 4 ? 0.2 : false),
        maxFuzzy: 2,
        combineWith: 'AND',
        boost: BOOST,
        filter: r => { const d = index.docs.get(r.id); return !!d && pass(d); },
      };
      for (const r of index.ms.search(v, ms)) {
        const d = index.docs.get(r.id);
        if (!d) continue;
        const tier = tierOf(d, r, v);
        const matchedFields = new Set<string>();
        let firstTerm = '';
        for (const [term, flds] of Object.entries(r.match)) {
          if (!firstTerm) firstTerm = term;
          flds.forEach(f => matchedFields.add(f));
        }
        const cand: Found = { tier, rel: r.score, why: whyOf(d, matchedFields, firstTerm || vWords[0]) };
        if (better(found.get(d.id), cand)) found.set(d.id, cand);
      }
    }

    // Contains — the query somewhere inside a word ("lev" in "Shalev").
    for (const d of index.docs.values()) {
      const have = found.get(d.id);
      if (have && TIER_BASE[have.tier] <= TIER_BASE.contains) continue;
      if (!pass(d)) continue;
      if (!words.every(w => d.hay.includes(w))) continue;
      if (d.nameT.startsWith(q)) { found.set(d.id, { tier: 'start', rel: 0 }); continue; }
      found.set(d.id, { tier: 'contains', rel: 0, why: whyContains(d, words[0]) });
    }

    // Digits — a phone, a folder number, a Zoho id, typed with or without dashes.
    const dq = digitsOf(text);
    if (dq.length >= 3) {
      for (const d of index.docs.values()) {
        const have = found.get(d.id);
        if (have && TIER_BASE[have.tier] <= TIER_BASE.digits) continue;
        if (!pass(d) || !d.digits.includes(dq)) continue;
        const f: WhyField = digitsOf(d.phone).includes(dq) ? 'phone'
          : digitsOf(d.folder).includes(dq) ? 'folder' : digitsOf(d.num).includes(dq) ? 'num' : 'address';
        const shown = (d as unknown as Record<string, string>)[WHY_SHOWN[f] ?? f] || d.name;
        found.set(d.id, { tier: 'digits', rel: 0, why: normalizeText(d.name).includes(dq) ? undefined : { field: f, text: shown, term: dq } });
      }
    }

    // Sounds like — the other alphabet, through the consonant skeleton.
    if (!digitsOnly) {
      const groups = words
        .filter(w => !/^\d+$/.test(w))
        .map(w => soundKeys(w).filter(k => k.length >= 2))
        .filter(ks => ks.length);
      if (groups.length && groups.length === words.filter(w => !/^\d+$/.test(w)).length) {
        const query = { combineWith: 'AND' as const, queries: groups.map(ks => ({ combineWith: 'OR' as const, queries: ks })) };
        const res = index.ms.search(query, {
          fields: ['sk'], prefix: true, fuzzy: false, combineWith: 'AND',
          tokenize: t => t.split(' ').filter(Boolean), processTerm: t => t,
          filter: r => { const d = index.docs.get(r.id); return !!d && pass(d); },
        });
        for (const r of res) {
          const d = index.docs.get(r.id);
          if (!d) continue;
          const cand: Found = { tier: 'sound', rel: r.score, why: soundWhy(d, words) };
          if (better(found.get(d.id), cand)) found.set(d.id, cand);
        }
      }
    }
  }

  // ── rank ──
  let maxRel = 0;
  found.forEach(f => { if (f.rel > maxRel) maxRel = f.rel; });
  const picks = opts.noPicks ? {} : readPicks();
  const pid = opts.projectId ?? '';
  const hits: SearchHit[] = [];
  for (const [id, f] of found) {
    const d = index.docs.get(id)!;
    let rank = TIER_BASE[f.tier] + KIND_BIAS[d.kind] + (opts.bias ?? 0);
    if (maxRel > 0) rank -= 40 * (f.rel / maxRel);
    if (d.when) {
      const days = Math.max(0, (now - d.when) / 86400000);
      rank -= 6 * Math.exp(-days / 90);
    }
    if (d.bin && d.kind === 'job') rank += 8;
    if (pid) {
      const p: PickMemory | undefined = picks[pickKey(pid, d.id)];
      if (p) {
        const w = pickWeight(p, now);
        if (pickedForQuery(p, text)) rank -= 100000;
        else if (w >= 0.1) rank -= Math.min(w, 5) * 3;
      }
    }
    hits.push({ docId: d.id, kind: d.kind, id: d.rid, aptId: d.aptId, rec: d.rec, tier: f.tier, rank, why: f.why, binLabel: d.binLabel });
  }
  hits.sort((a, b) => a.rank - b.rank);
  return capHits(hits, opts.limit ?? 40, opts.perKind ?? 15);
}

function tierOf(d: Doc, r: MsResult, v: string): SearchTier {
  if (d.nameT.startsWith(v)) return 'start';
  const qs = r.queryTerms;
  const ts = r.terms;
  if (qs.every(t => ts.includes(t))) return 'exact';
  if (qs.every(t => ts.some(x => x.startsWith(t)))) return 'prefix';
  return 'fuzzy';
}

function soundWhy(d: Doc, words: string[]): SearchHit['why'] {
  // Which naming field carries a word with the same sound as the query's first word?
  const keys = new Set(soundKeys(words[0] ?? ''));
  if (!keys.size) return undefined;
  const carries = (raw: string) => tokenize(raw).some(t => soundKeys(t).some(k => keys.has(k) || [...keys].some(q => k.startsWith(q))));
  if (carries(d.name)) return undefined;
  for (const f of ['folder', 'family', 'first', 'city', 'address', 'who'] as WhyField[]) {
    const raw = (d as unknown as Record<string, string>)[f] ?? '';
    if (raw && carries(raw)) {
      const shown = (d as unknown as Record<string, string>)[WHY_SHOWN[f] ?? f] || raw;
      return { field: f, text: shown, term: words[0] };
    }
  }
  return undefined;
}

/** Keep the list short and no one kind hogging it. */
export function capHits(hits: SearchHit[], limit: number, perKind: number): SearchHit[] {
  const per = new Map<SearchKind, number>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const n = per.get(h.kind) ?? 0;
    if (n >= perKind) continue;
    per.set(h.kind, n + 1);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Search ONE list of jobs — the job list page, a group window, the Find-a-job
 * widget. Returns hits in rank order; `hit.rec` is the Apartment.
 */
export function searchJobs(jobs: Apartment[], query: string, opts: SearchOpts & { stages?: Stage[]; includeTrash?: boolean } = {}): SearchHit<Apartment>[] {
  const index = jobsIndex(jobs, opts.stages, opts.includeTrash ?? true);
  return searchIndex(index, query, { limit: 500, perKind: 500, noPicks: true, ...opts, kinds: ['job'] }) as SearchHit<Apartment>[];
}

/** A hit's "why" as one short line: "Folder: Cohen, David - 5555". */
export function whyLabel(why: NonNullable<SearchHit['why']>, words: Partial<Record<WhyField, string>>): string {
  const name = words[why.field] ?? why.field;
  return `${name}: ${why.text}`;
}
