/**
 * THE TEST WORLD on the PRACTICE board (session #170, 2026-11-10).
 *
 * The owner: "So we don't have a job that's not in finance, that's in the CRM,
 * that's not in Wolfson ... I need test data that I can actually work with."
 * One made-up world, the same in every app: docs/test-world/world.json (made by
 * the CRM repo). This file turns the part the job board needs (`deals[].board`,
 * the towers and their units, the customers) into the board's own records.
 *
 * Pure: no Firestore here. testWorldRun.ts does the reading and writing, and
 * only ever on the practice project.
 *
 *  - the ten towers go into two workspaces, "Test towers 1-5" and "6-10" (five fit the TV), a building
 *    per tower, its flats laid out floor by floor; sold flats carry the buyer's name and
 *    made-up phone, the won project job's number sits on every flat of its
 *    tower, an upgrade's number on its own flat (marked "shinui");
 *  - every private job (private, renovation, maintenance, planning) becomes a
 *    tile on the Job Board with its job number, customer, address and stage;
 *  - every board task becomes a task on the notebook / calendar for the same
 *    person: staff are SLOTS in world.json (tech1..tech4, office ...); here each
 *    slot is one of the people the practice board already has, by role;
 *    subcontractors become workers of their own, "(test)" in the name;
 *  - a problem on a task becomes a problem task with the worker's message,
 *    finished jobs get an inspection, and a few photos are drawn placeholders.
 *
 * Every record written carries `testWorld: true`, so the remover can take out
 * exactly these and nothing else.
 */
import type { Apartment, Building, Contractor, ContractorAssignment, ContractorNote, ContractorPhoto, GeneralWhere, Project, Stage, User } from '../types';
import { applyMarks, marksForCurrent } from './stageMarks';
import { layoutToApartments, newSlot } from './projectLayout';
import type { LayoutBuilding } from './projectLayout';

type Rec = Record<string, unknown>;

// ── the part of world.json read here ────────────────────────────────────────
export interface TWCustomer { key: string; kind: string; name: string; nameHe?: string; phone?: string; city?: string; address?: string }
export interface TWUnit { key: string; label: string; floor: number; status: string; owner: string | null }
export interface TWProject { key: string; name: string; address: string; city: string; units: TWUnit[] }
export interface TWBoardTask { title: string; worker: string; date: string; status: string; problem?: string | null }
export interface TWBoard { jobNo: string; building: string; address: string; flat: string | null; floor: number | null; stage: string; workers: string[]; tasks: TWBoardTask[] }
export interface TWPhoto { key: string; stage?: string; caption?: string; takenAt?: string; by?: string }
export interface TWDeal { number: string; kind: string; kindLabel?: string; customer: string; project: string | null; unit: string | null; title?: string; board?: TWBoard | null; photos?: TWPhoto[] }
export interface TWSub { key: string; name: string; phone?: string; trade?: string }
export interface TestWorldFile {
  meta: { name: string; version: number; day: string };
  customers: TWCustomer[];
  projects: TWProject[];
  deals: TWDeal[];
  subcontractors: TWSub[];
  staff: { slot: string; role: string }[];
}

/** The marker every test-world record carries. */
export const TW_FLAG = 'testWorld';
/** Workspace ids of the test towers start with this. */
export const TW_PREFIX = 'tw-';
/** The two workspaces that hold the ten test towers (five each). */
export const TOWER_GROUPS = [
  { id: 'tw-towers-a', name: 'Test towers 1-5 (test world)', short: 'Towers 1-5', nameHe: 'מגדלי בדיקה 1-5', color: '#0e7490' },
  { id: 'tw-towers-b', name: 'Test towers 6-10 (test world)', short: 'Towers 6-10', nameHe: 'מגדלי בדיקה 6-10', color: '#9333ea' },
] as const;

export interface TWContext {
  stages: Stage[];
  contractors: Contractor[];
  users: User[];
  /** Job Board tiles that stay (after the clear): new tiles go below them. */
  generalTiles: Pick<Apartment, 'canvasY' | 'boardBin'>[];
  /** The world's day (ISO), the "now" of every made-up time. */
  now?: string;
  /** A fresh portal token for a new worker. */
  makeToken: () => string;
}

export interface TWWrite { col: string; id: string; data: Rec }
export interface TWPlan {
  /** The tower workspaces and their buildings (settings/app). */
  projects: { project: Project & { testWorld: true }; buildings: Building[] }[];
  /** Every document to create, each with testWorld: true. */
  writes: TWWrite[];
  /** Who each staff slot is on this board. */
  slots: Record<string, { id: string; name: string; kind: 'worker' | 'office' }>;
  counts: Record<string, number>;
}

const col = (pid: string, base: string) => (pid === 'wolfson' ? base : `${pid}_${base}`);
const iso = (day: string, hour = 10, min = 0) => new Date(`${day}T${String(hour - 2).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`).toISOString();
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The next working day (Sun–Thu) after `day`. */
function nextWorkDay(day: string): string {
  let d = addDays(day, 1);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() > 4) d = addDays(d, 1);
  return d;
}

/** A small drawn picture standing in for a site photo (world.json's Drive ids are fake). */
export function placeholderPhoto(caption: string, jobNo: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">`
    + `<rect width="640" height="480" fill="#e2e8f0"/><rect x="24" y="24" width="592" height="432" rx="18" fill="#f8fafc" stroke="#94a3b8" stroke-width="4" stroke-dasharray="14 10"/>`
    + `<circle cx="320" cy="190" r="54" fill="none" stroke="#64748b" stroke-width="10"/><rect x="226" y="146" width="188" height="120" rx="16" fill="none" stroke="#64748b" stroke-width="10"/>`
    + `<text x="320" y="330" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#334155" text-anchor="middle">TEST PHOTO · ${esc(jobNo)}</text>`
    + `<text x="320" y="372" font-family="Arial, sans-serif" font-size="24" fill="#475569" text-anchor="middle">${esc(caption.slice(0, 44))}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/** Which practice person stands in for each staff slot. Office slots → office users, tech slots → workers. */
export function assignSlots(world: TestWorldFile, ctx: TWContext) {
  const slots: TWPlan['slots'] = {};
  const active = ctx.contractors.filter(c => c.active !== false && !(c as unknown as Rec)[TW_FLAG]);
  const byAge = (a: { createdAt?: string }, b: { createdAt?: string }) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  const ac = active.filter(c => c.category === 'ac').sort(byAge);
  const rest = active.filter(c => c.category !== 'ac').sort(byAge);
  const techPool = [...ac, ...rest];
  const techs = world.staff.filter(s => s.role === 'technician').map(s => s.slot);
  techs.forEach((slot, i) => {
    const c = techPool[i];
    if (c) slots[slot] = { id: c.id, name: c.name, kind: 'worker' };
  });
  const users = ctx.users.filter(u => u.active !== false).sort(byAge);
  const byRole = (re: RegExp) => users.find(u => re.test(u.role));
  const office: Record<string, User | undefined> = {
    owner: byRole(/admin|owner/i), admin: byRole(/admin/i), office: byRole(/coordinator|office|secret/i),
    accounts: byRole(/viewer|account/i), sales1: byRole(/project manager|sales/i),
    sales2: users.filter(u => /project manager|sales/i.test(u.role))[1] ?? byRole(/project manager|sales/i),
    site: users.filter(u => /project manager|site/i.test(u.role)).slice(-1)[0],
  };
  for (const s of world.staff) {
    if (slots[s.slot]) continue;
    const u = office[s.slot] ?? users[0];
    if (u) slots[s.slot] = { id: u.id, name: u.name, kind: 'office' };
  }
  return slots;
}

/** The stage a world stage name means, in this board's own stage list. */
function stageFor(name: string, sorted: Stage[], general: boolean): Stage | null {
  const find = (re: RegExp) => sorted.find(s => re.test(s.name)) ?? null;
  switch (name) {
    case 'Quote sent': return general ? find(/quote/i) : find(/ready/i);
    case 'Piping': return find(/^piping/i) ?? find(/pip/i);
    case 'Units installed': return general ? (find(/^units installed/i) ?? find(/units/i)) : (find(/wall units/i) ?? find(/units/i));
    case 'Job completed': return find(/completed|done/i);
    default: return null;
  }
}

function withStage(apt: Rec, stage: Stage | null, sorted: Stage[], day: string): Rec {
  if (!stage) return apt;
  const a = apt as unknown as Apartment;
  const marks = marksForCurrent(a, stage.id, sorted);
  Object.assign(apt, applyMarks(a, marks, sorted));
  const dates: Record<string, string> = {};
  let back = sorted.filter(s => s.order <= stage.order).length * 6;
  for (const s of sorted) if (s.order <= stage.order) { dates[s.id] = iso(addDays(day, -back), 10); back -= 6; }
  apt.stageDates = dates;
  return apt;
}

export function buildTestWorld(world: TestWorldFile, ctx: TWContext): TWPlan {
  const day = ctx.now ?? world.meta.day;
  const nowIso = iso(day, 9);
  const writes: TWWrite[] = [];
  const put = (c: string, id: string, data: Rec) => writes.push({ col: c, id, data: { ...data, id, [TW_FLAG]: true } });
  const cust = new Map(world.customers.map(c => [c.key, c]));
  const projectByKey = new Map(world.projects.map(p => [p.key, p]));
  const slots = assignSlots(world, ctx);
  const office = slots.office ?? slots.admin ?? slots.owner;
  const by = { id: office?.id ?? 'tw-office', name: office?.name ?? 'Office' };

  const active = ctx.stages.filter(s => s.active !== false);
  const sortedG = active.filter(s => s.projectId === 'general').sort((a, b) => a.order - b.order);
  const sortedB = active.filter(s => !s.projectId).sort((a, b) => a.order - b.order);
  const workB = sortedB.filter(s => s.kind !== 'marker');
  const workG = sortedG.filter(s => s.kind !== 'marker');

  // ── subcontractors: workers of their own ──────────────────────────────────
  const subColors = ['#0f766e', '#b45309', '#7c3aed', '#be123c'];
  world.subcontractors.forEach((s, i) => {
    const category: Contractor['category'] = s.trade === 'drywall' ? 'drywall' : s.trade === 'piping' ? 'ac' : 'general';
    const id = `tw-${s.key}`;
    slots[s.key] = { id, name: s.name, kind: 'worker' };
    put('contractors', id, {
      name: s.name, email: `${s.key}@test.tzviair.local`, category, levelId: 'lvl-contractor',
      token: ctx.makeToken(), active: true, color: subColors[i % subColors.length], createdAt: iso(addDays(day, -60)),
    } satisfies Omit<Contractor, 'id'>);
  });

  /** A flat on the board shows the family name; a company keeps its whole name. */
  const flatName = (c: TWCustomer) => (c.kind === 'person' ? c.name.split(' ').slice(-1)[0] : c.name.replace(/\s*\(test\)\s*$/, ''));
  const nameOf = (key: string | null | undefined) => {
    const c = key ? cust.get(key) : undefined;
    return c?.name ?? '';
  };

  // ── towers: two workspaces of five, a building per tower ─────────────────
  // Ten workspaces crowded every workspace strip; one workspace of ten put
  // ten buildings side by side on the TV, past its smallest size. Five fit.
  const groups = [TOWER_GROUPS[0], TOWER_GROUPS[1]].map(g => ({
    project: {
      id: g.id, name: g.name, shortName: g.short, nameHe: g.nameHe, shortNameHe: g.nameHe,
      logoPath: '/general-logo.svg', type: 'building' as const, color: g.color, testWorld: true as const,
    },
    buildings: [] as Building[],
  }));
  const towerApts: { pid: string; apt: Rec }[] = [];
  const projects: TWPlan['projects'] = groups;
  const won = world.deals.filter(d => d.board);
  const flatOfUnit = new Map<string, { pid: string; apt: Rec }>();
  const buildingOf = new Map<string, { pid: string; bid: string }>();
  world.projects.forEach((p, i) => {
    const g = groups[i < 5 ? 0 : 1];
    const pid = g.project.id;
    const bid = p.key.toUpperCase();
    buildingOf.set(p.key, { pid, bid });
    const short = p.name.replace(/\s*\(test\)\s*$/, '');
    const building: Building = { id: bid, name: short, displayOrder: (i % 5) + 1 };
    g.buildings.push(building);
    const floors = [...new Set(p.units.map(u => u.floor))].sort((a, b) => b - a);
    const layout: LayoutBuilding = {
      id: bid, name: building.name, displayOrder: i + 1,
      floors: floors.map(f => ({
        label: String(f),
        slots: p.units.filter(u => u.floor === f).map(u => ({ ...newSlot('apartment'), number: u.label.replace(/^\D+/, ''), pinned: true })),
      })),
    };
    const apts = layoutToApartments({ buildings: [layout] } as never, []) as unknown as Rec[];
    const projectJob = won.find(d => d.project === p.key && !d.unit && d.kind === 'project');
    const jobStage = projectJob?.board ? stageFor(projectJob.board.stage, sortedB, false) : null;
    for (const a of apts) {
      const unit = p.units.find(u => u.label.replace(/^\D+/, '') === a.apartmentNumber)!;
      const owner = unit.owner ? cust.get(unit.owner) : undefined;
      Object.assign(a, {
        displayName: owner ? flatName(owner) : '',
        createdAt: iso(addDays(day, -120)), updatedAt: nowIso, contentUpdatedAt: nowIso,
        updatedBy: by.id, updatedByName: by.name,
        classification: 'standard', shinuiDetails: null, generalNotes: '', isUnnamed: false,
        ...(owner?.phone ? { phone: owner.phone } : {}),
        ...(projectJob ? { jobNo: projectJob.number } : {}),
      });
      a.address = p.address;
      if (unit.status === 'sold' && !owner) a.generalNotes = 'Sold; buyer not in the list yet (test)';
      withStage(a, jobStage, sortedB, day);
      flatOfUnit.set(unit.key, { pid, apt: a });
      towerApts.push({ pid, apt: a });
    }
  });

  // ── tasks, problems, photos, inspections ─────────────────────────────────
  let noteSeq = 0, photoSeq = 0;
  const taskOut = (pid: string, id: string, t: Partial<ContractorAssignment>) => put(col(pid, 'contractorAssignments'), id, {
    createdAt: iso(addDays(day, -14), 9), createdBy: by.id, createdByName: by.name, priority: 'normal',
    plannedAt: iso(addDays(day, -14), 9), plannedBy: by.name, ...t,
  });
  const noteOut = (pid: string, n: Omit<ContractorNote, 'id'>) => {
    const id = `CN-tw-${++noteSeq}`;
    put(col(pid, 'contractorNotes'), id, n as unknown as Rec);
  };

  function tasksFor(deal: TWDeal, pid: string, aptId: string, buildingId: string, work: Stage[], general?: GeneralWhere) {
    const b = deal.board!;
    const firstTaskId: Record<string, string> = {};
    let firstStage: string | null = null;
    b.tasks.forEach((t, k) => {
      const w = slots[t.worker];
      if (!w) return;
      const id = `T-tw-${b.jobNo}-${k + 1}`;
      const stage = /pipe/i.test(t.title) ? (work.find(s => /pip/i.test(s.name)) ?? null)
        : /indoor|unit/i.test(t.title) ? (work.find(s => /wall units|units/i.test(s.name)) ?? null)
        : /commission|handover/i.test(t.title) ? (work.find(s => /thermostat|haffala|commission/i.test(s.name)) ?? null) : null;
      const days = t.status === 'in_progress' ? [t.date, nextWorkDay(t.date)] : undefined;
      taskOut(pid, id, {
        contractorId: w.id, apartmentId: general ? '' : aptId, buildingId,
        taskDescription: `${t.title} · ${b.jobNo}`, dueDate: days ? days[1] : t.date,
        stageId: stage?.id ?? null, ...(stage ? { stageIds: [stage.id] } : {}),
        completedAt: t.status === 'done' ? iso(t.date, 15, 30) : null,
        ...(days ? { days } : {}), ...(general ? { general } : {}),
      });
      firstTaskId[t.worker] ??= id;
      firstStage ??= stage?.id ?? null;
      if (t.problem) {
        const pidTask = `T-tw-${b.jobNo}-p${k + 1}`;
        const solved = t.status === 'done';
        taskOut(pid, pidTask, {
          contractorId: w.id, apartmentId: general ? '' : aptId, buildingId,
          taskDescription: `${t.problem} · ${b.jobNo}`, dueDate: solved ? t.date : day, stageId: null,
          completedAt: solved ? iso(t.date, 16) : null, priority: 'urgent', ...(general ? { general } : {}),
          problem: solved
            ? { photosRequired: true, status: 'solved', stageBefore: null, closedAt: iso(t.date, 16), approvedAt: iso(t.date, 17), approvedBy: by.name }
            : { photosRequired: true, status: 'open', stageBefore: null },
        });
        noteOut(pid, { assignmentId: pidTask, apartmentId: general ? '' : aptId, contractorId: w.id, text: `${t.problem}. Needs to be fixed before the handover.`, authorType: 'contractor', authorId: w.id, authorName: w.name, createdAt: iso(addDays(day, -1), 14) });
        noteOut(pid, { assignmentId: pidTask, apartmentId: general ? '' : aptId, contractorId: w.id, text: solved ? 'Fixed and checked, thanks.' : 'Please send a photo when it is fixed.', authorType: 'office', authorId: by.id, authorName: by.name, createdAt: iso(addDays(day, -1), 16) });
      }
    });
    // Subcontractors on the job: one task each, beside the first task.
    b.workers.filter(s => s.startsWith('sub-')).forEach((s, k) => {
      const w = slots[s];
      if (!w || !b.tasks[0]) return;
      const sub = world.subcontractors.find(x => x.key === s);
      const what = sub?.trade === 'drywall' ? 'Close the drywall around the units' : sub?.trade === 'electricity' ? 'Electric points for the units' : sub?.trade === 'crane' ? 'Lift the outdoor units' : 'Help with the piping';
      const date = b.tasks[Math.min(1, b.tasks.length - 1)].date;
      taskOut(pid, `T-tw-${b.jobNo}-s${k + 1}`, {
        contractorId: w.id, apartmentId: general ? '' : aptId, buildingId,
        taskDescription: `${what} · ${b.jobNo}`, dueDate: date, stageId: null,
        completedAt: date < day ? iso(date, 15) : null, ...(general ? { general } : {}),
      });
    });
    // A few photos (placeholders), on the first task of the one who took them.
    (deal.photos ?? []).slice(0, 2).forEach(ph => {
      const w = slots[ph.by ?? ''] ?? slots[b.workers[0]];
      const taskId = firstTaskId[ph.by ?? ''] ?? Object.values(firstTaskId)[0];
      if (!w || !taskId) return;
      const id = `PH-tw-${++photoSeq}`;
      put(col(pid, 'contractorPhotos'), id, {
        assignmentId: taskId, apartmentId: general ? '' : aptId, contractorId: w.id,
        // The picture rides in storageUrl: the app keeps a photo's dataUrl on the computer that took it only.
        dataUrl: '', storageUrl: placeholderPhoto(ph.caption ?? 'Site photo', b.jobNo), filename: `${ph.key}.svg`, fileType: 'image',
        mimeType: 'image/svg+xml', uploadedAt: ph.takenAt ? new Date(ph.takenAt).toISOString() : nowIso,
        ...(firstStage ? { stageId: firstStage } : {}),
      } satisfies Omit<ContractorPhoto, 'id'>);
    });
  }

  /** A finished job's inspection, after its last stage, with a placeholder picture. */
  function inspect(apt: Rec, deal: TWDeal, sorted: Stage[]) {
    const last = [...sorted].reverse().find(s => s.kind !== 'marker');
    const when = deal.board!.tasks.slice(-1)[0]?.date ?? day;
    apt.inspections = [{
      id: `IN-tw-${deal.board!.jobNo}`, at: iso(when, 12), byId: by.id, byName: by.name, afterStageId: last?.id ?? null,
      files: [{ filename: `inspection-${deal.board!.jobNo}.svg`, mimeType: 'image/svg+xml', dataUrl: placeholderPhoto('Inspection: all units working', deal.board!.jobNo) }],
    }];
  }

  // ── the Job Board: private jobs as tiles ─────────────────────────────────
  const TILE_W = 215, TILE_H = 132, GAP = 22, PER_ROW = 7;
  const onBoard = ctx.generalTiles.filter(t => !t.boardBin && typeof t.canvasY === 'number');
  const top = onBoard.length ? Math.max(640, ...onBoard.map(t => (t.canvasY ?? 0) + TILE_H + 120)) : 640;
  let slot = 0;
  for (const d of won) {
    const b = d.board!;
    const tower = d.project ? projectByKey.get(d.project) : undefined;
    if (tower) {
      const { pid, bid } = buildingOf.get(tower.key)!;
      if (d.unit) {
        // An upgrade in one flat: its own number, marked as a change, its own stage.
        const f = flatOfUnit.get(d.unit);
        if (!f) continue;
        Object.assign(f.apt, { jobNo: b.jobNo, classification: 'shinui', generalNotes: `${d.kindLabel ?? 'Upgrade'} · ${d.title ?? ''}`.trim() });
        const owner = cust.get(d.customer);
        if (owner && !f.apt.displayName) { f.apt.displayName = flatName(owner); if (owner.phone) f.apt.phone = owner.phone; }
        withStage(f.apt, stageFor(b.stage, sortedB, false), sortedB, day);
        tasksFor(d, pid, String(f.apt.id), bid, workB);
        if (b.stage === 'Job completed') inspect(f.apt, d, sortedB);
      } else {
        tasksFor(d, pid, '', bid, workB, { projectId: pid, buildingId: bid });
        if (b.stage === 'Job completed') towerApts.filter(x => x.apt.buildingId === bid).forEach(x => inspect(x.apt, d, sortedB));
      }
      continue;
    }
    // A private job: a tile on the Job Board.
    const c = cust.get(d.customer);
    const id = `G-tw-${b.jobNo}`;
    const name = nameOf(d.customer) || d.title || b.jobNo;
    const city = c?.city ?? b.address.split(',').slice(-1)[0].trim();
    const s = slot++;
    const apt: Rec = {
      buildingId: 'G', apartmentNumber: '', displayName: name, floor: 0, colPosition: 1, colSpan: 1,
      isDuplexApt: false, currentStageId: null, classification: 'standard', shinuiDetails: null, isUnnamed: false,
      generalNotes: `${d.kindLabel ?? ''} (test world)`.trim(),
      jobNo: b.jobNo,
      address: `${b.address}${b.flat ? ` · ${b.flat}` : ''}${b.floor != null ? `, floor ${b.floor}` : ''}`,
      ...(c?.phone ? { phone: c.phone } : {}),
      driveFolderName: `${name} - ${b.jobNo} - ${city}`,
      canvasX: GAP + (s % PER_ROW) * (TILE_W + GAP), canvasY: top + Math.floor(s / PER_ROW) * (TILE_H + GAP),
      createdAt: iso(addDays(day, -30)), updatedAt: nowIso, contentUpdatedAt: nowIso, updatedBy: by.id, updatedByName: by.name,
    };
    withStage(apt, stageFor(b.stage, sortedG, true), sortedG, day);
    if (b.stage === 'Job completed') inspect(apt, d, sortedG);
    put('general_apartments', id, apt);
    tasksFor(d, 'general', id, 'G', workG);
  }
  // The towers' flats, now that the upgrades are marked.
  for (const x of towerApts) put(col(x.pid, 'apartments'), String(x.apt.id), x.apt);

  const counts: Record<string, number> = {};
  for (const w of writes) {
    const base = w.col.replace(/^.*_/, '');
    counts[base] = (counts[base] ?? 0) + 1;
  }
  counts.towers = groups.reduce((n, g) => n + g.buildings.length, 0);
  return { projects, writes, slots, counts };
}

// ── the clear: the old practice world, before the test world goes in ───────

/** Ids the practice seed (scripts/practice/world.ts) gives, per collection. */
const SEED_IDS: Record<string, RegExp> = {
  contractorAssignments: /^T-prac-\d+$/,
  contractorNotes: /^CN-prac-\d+$/,
  stageNotes: /^SN-/,
  planPins: /^PP-prac-/,
  planAnnotations: /^PA-prac-/,
  activityLogs: /^AL-prac-/,
  stageSuggestions: /^SS-prac-/,
  timePunches: /^TP-pe-/,
};
/** The fields the seed fills on a building's flat; a cleared flat goes back to empty. */
export const FLAT_SEED_FIELDS = [
  'displayName', 'phone', 'tipus', 'classification', 'stageMarks', 'currentStageId', 'bubbles', 'stageDates',
  'customAnswers', 'noteEntries', 'generalNotes', 'plansPdfLink', 'jobNo', 'crmCustomerId', 'crmMoney', 'financeBalance',
] as const;
const FLAT_EMPTY: Record<string, unknown> = { displayName: '', classification: 'standard', currentStageId: null, stageDates: {}, generalNotes: '' };

const FAKE_PHONE = /^0\d{1,2}-?000-?\d{3,4}$/;
const PHONE = /(?:\+972[- ]?|\b0)5\d[- ]?\d{3}[- ]?\d{4}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const FAKE_MAIL = /@(?:practice\.invalid|test\.tzviair\.local)$/i;

/** Anything in a record that looks like a real person's phone or email. */
export function realLooking(doc: unknown): string[] {
  const hits: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      for (const m of v.match(PHONE) ?? []) if (!FAKE_PHONE.test(m.replace(/\s/g, '').replace(/^\+972-?/, '0'))) hits.push(m);
      for (const m of v.match(EMAIL) ?? []) if (!FAKE_MAIL.test(m)) hits.push(m);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(doc);
  return hits;
}

export interface ClearPlan {
  deletes: { col: string; id: string; data: Rec; workspace?: string; base: string }[];
  patches: { col: string; id: string; before: Rec; absent: string[]; after: Rec }[];
  keptReal: { col: string; id: string; why: string }[];
  keptOther: Record<string, number>;
}

/**
 * What to clear, from the cloud's own documents. `byCol` maps a collection to
 * its documents; `workspaceOf` tells which workspace a collection belongs to
 * (and its base name). Only what the practice seed made is touched; anything
 * that looks real (a phone or email outside the made-up ranges) is listed and kept.
 */
export function planClear(
  byCol: Record<string, Rec[]>,
  workspaceOf: (c: string) => { pid: string | null; base: string },
  isBuildingWorkspace: (pid: string) => boolean,
): ClearPlan {
  const plan: ClearPlan = { deletes: [], patches: [], keptReal: [], keptOther: {} };
  const keepOther = (c: string) => { plan.keptOther[c] = (plan.keptOther[c] ?? 0) + 1; };
  for (const [c, docs] of Object.entries(byCol)) {
    const { pid, base } = workspaceOf(c);
    for (const d of docs) {
      const id = String(d.id);
      if (d[TW_FLAG]) continue;
      let action: 'delete' | 'patch' | null = null;
      if (base === 'apartments') {
        if (pid === 'general') action = /^G-prac-\d+$/.test(id) ? 'delete' : null;
        else if (pid && isBuildingWorkspace(pid) && FLAT_SEED_FIELDS.some(f => {
          const v = d[f];
          return v !== undefined && v !== null && v !== '' && !(f === 'classification' && v === 'standard')
            && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
        })) action = 'patch';
      } else if (base === 'canvasElements') {
        // The weekly notebook's made-up squares (the notebook itself stays).
        const data = d.data as Rec | undefined;
        if (id === 'CE-prac-notebook' && data && (Object.keys((data.cells as Rec) ?? {}).length || Object.keys((data.stickies as Rec) ?? {}).length)) action = 'patch';
      } else if (SEED_IDS[base]?.test(id)) {
        if (base === 'stageNotes') {
          const entries = (d.entries as Rec[] | undefined) ?? [];
          action = entries.length && entries.every(e => String(e.id).startsWith('SNE-')) ? 'delete' : null;
        } else action = 'delete';
      }
      if (!action) { keepOther(c); continue; }
      const real = realLooking(d);
      if (real.length) { plan.keptReal.push({ col: c, id, why: [...new Set(real)].slice(0, 3).join(', ') }); continue; }
      const { _updatedAt: _u, ...data } = d;
      void _u;
      if (action === 'delete') plan.deletes.push({ col: c, id, data, workspace: pid ?? undefined, base });
      else if (base === 'apartments') {
        const before: Rec = {}; const absent: string[] = []; const after: Rec = {};
        for (const f of FLAT_SEED_FIELDS) {
          if (f in d) before[f] = d[f]; else absent.push(f);
          after[f] = f in FLAT_EMPTY ? FLAT_EMPTY[f] : undefined;
        }
        plan.patches.push({ col: c, id, before, absent, after });
      } else {
        const dataField = d.data as Rec;
        plan.patches.push({ col: c, id, before: { data: dataField }, absent: [], after: { data: { ...dataField, cells: {}, stickies: {} } } });
      }
    }
  }
  return plan;
}
