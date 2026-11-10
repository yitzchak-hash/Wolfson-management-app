/**
 * Loads and removes the TEST WORLD (testWorld.ts) on the PRACTICE board only.
 *
 * Locked: every call refuses unless this is the practice build AND the
 * Firestore it talks to is the practice project (`wolfson-practice`, or the
 * local emulator under that name). The live board never runs any of this.
 *
 * Load:   (1) optionally clears what the practice seed made up, saving a copy
 *             of every document it deletes or changes in `testWorldSaved`;
 *         (2) writes the test world, every document with `testWorld: true`;
 *         (3) adds the tower workspaces to settings/app (marked testWorld).
 * Remove: deletes every `testWorld: true` document, takes the tower
 *         workspaces out of settings/app, puts back every saved copy exactly,
 *         then deletes the saved copies.
 */
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, runTransaction,
  deleteField, serverTimestamp, FieldPath,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { db, fsTombstone, fsUntombstone } from './firebase';
import { PRACTICE, PRACTICE_PROJECT } from './practice';
import { buildTestWorld, planClear, TW_FLAG, TW_PREFIX } from './testWorld';
import type { TestWorldFile, ClearPlan } from './testWorld';
import type { Apartment, Contractor, Stage, User } from '../types';

type Rec = Record<string, unknown>;

/** The saved copies and the manifest (in the full backup's global list). */
const SAVED = 'testWorldSaved';
const MANIFEST = 'manifest';

/** lib/fullBackup.js WORKSPACE_COLLECTIONS (that file is server-side). */
const WS_BASES = [
  'apartments', 'canvasElements', 'contractorAssignments', 'contractorNotes', 'contractorPhotos',
  'stageNotes', 'stageNoteVersions', 'generalNoteVersions', 'activityLogs', 'officeNoteFiles',
  'planPins', 'planAnnotations', 'boardLayouts',
];
const GLOBALS_WITH_RECORDS = ['contractors', 'users', 'stages', 'employees', 'timePunches', 'stageSuggestions'];
const BUILT_IN = ['wolfson', 'general', 'netiv'];
/** Collections whose deletions every device must hear of (they keep local copies). */
const TOMBSTONED = new Set(['apartments', 'canvasElements']);

const colName = (pid: string, base: string) => (pid === 'wolfson' ? base : `${pid}_${base}`);

/** Hard stop unless this is the practice build on the practice project. */
export function practiceDb(): Firestore {
  const projectId = db?.app.options.projectId;
  if (!PRACTICE || !db || projectId !== PRACTICE_PROJECT) {
    throw new Error(`Refused: the test world is only for the practice board (${PRACTICE_PROJECT}); this is "${projectId ?? 'no database'}".`);
  }
  return db;
}

export type Progress = (msg: string) => void;

async function readAll(d: Firestore, c: string): Promise<Rec[]> {
  const snap = await getDocs(collection(d, c));
  return snap.docs.map(x => ({ id: x.id, ...x.data() }));
}

async function commitAll(d: Firestore, ops: Array<(b: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(d);
    ops.slice(i, i + 400).forEach(op => op(b));
    await b.commit();
  }
}

/** Workspaces in settings/app (built-in + added), and the settings themselves. */
async function readSettings(d: Firestore) {
  const snap = await getDoc(doc(d, 'settings', 'app'));
  const s = (snap.exists() ? snap.data() : {}) as Rec;
  const custom = (s.customProjects as Rec[] | undefined) ?? [];
  return { s, custom, workspaces: [...BUILT_IN, ...custom.map(p => String(p.id))] };
}

export interface TestWorldStatus { loaded: boolean; manifest: Rec | null }
export async function testWorldStatus(): Promise<TestWorldStatus> {
  const d = practiceDb();
  const m = await getDoc(doc(d, SAVED, MANIFEST));
  return { loaded: m.exists(), manifest: m.exists() ? m.data() as Rec : null };
}

export interface LoadReport {
  cleared: { deleted: Record<string, number>; changed: Record<string, number>; keptReal: ClearPlan['keptReal']; keptOther: Record<string, number> } | null;
  written: Record<string, number>;
  slots: Record<string, string>;
}

function tally(list: { col: string }[]) {
  const out: Record<string, number> = {};
  for (const x of list) out[x.col] = (out[x.col] ?? 0) + 1;
  return out;
}

/** Puts the test world in. `clear`: first take out what the practice seed made up. */
export async function loadTestWorld(opts: { clear: boolean; by: string }, progress: Progress = () => {}): Promise<LoadReport> {
  const d = practiceDb();
  if ((await testWorldStatus()).loaded) throw new Error('The test world is already in. Remove it first.');
  progress('Reading the practice board …');
  const { custom, workspaces } = await readSettings(d);
  const leftovers = custom.filter(p => p[TW_FLAG] || String(p.id).startsWith(TW_PREFIX));
  if (leftovers.length) throw new Error('Test towers are still in the settings. Press "Remove test world" first.');
  const realWs = workspaces;
  const isBuilding = (pid: string) => pid !== 'general' && (custom.find(p => p.id === pid)?.type ?? 'building') !== 'general';

  let report: LoadReport['cleared'] = null;
  if (opts.clear) {
    progress('Looking through the old practice records …');
    const byCol: Record<string, Rec[]> = {};
    const owner = new Map<string, { pid: string | null; base: string }>();
    for (const pid of realWs) for (const base of WS_BASES) { const c = colName(pid, base); byCol[c] = await readAll(d, c); owner.set(c, { pid, base }); }
    for (const c of GLOBALS_WITH_RECORDS) { byCol[c] = await readAll(d, c); owner.set(c, { pid: null, base: c }); }
    const plan = planClear(byCol, c => owner.get(c)!, isBuilding);
    progress(`Saving a copy of ${plan.deletes.length + plan.patches.length} records, then clearing them …`);
    // 1. The copies first, so nothing is lost if the page closes half way.
    await commitAll(d, [
      ...plan.deletes.map(x => (b: ReturnType<typeof writeBatch>) => b.set(doc(d, SAVED, `${x.col}~${x.id}`), { [TW_FLAG]: true, col: x.col, docId: x.id, op: 'deleted', data: x.data, workspace: x.workspace ?? null, base: x.base, at: serverTimestamp() })),
      ...plan.patches.map(x => (b: ReturnType<typeof writeBatch>) => b.set(doc(d, SAVED, `${x.col}~${x.id}`), { [TW_FLAG]: true, col: x.col, docId: x.id, op: 'changed', before: x.before, absent: x.absent, at: serverTimestamp() })),
    ]);
    // 2. Tell every device first (they keep local copies of flats and board items), then delete.
    const tomb: Record<string, string[]> = {};
    for (const x of plan.deletes) if (x.workspace && TOMBSTONED.has(x.base)) (tomb[x.workspace] ??= []).push(x.id);
    for (const [pid, ids] of Object.entries(tomb)) await fsTombstone(pid, ids);
    await commitAll(d, [
      ...plan.deletes.map(x => (b: ReturnType<typeof writeBatch>) => b.delete(doc(d, x.col, x.id))),
      ...plan.patches.map(x => (b: ReturnType<typeof writeBatch>) => b.update(doc(d, x.col, x.id), {
        ...Object.fromEntries(Object.entries(x.after).map(([k, v]) => [k, v === undefined ? deleteField() : v])),
        _updatedAt: serverTimestamp(),
      })),
    ]);
    report = { deleted: tally(plan.deletes), changed: tally(plan.patches), keptReal: plan.keptReal, keptOther: plan.keptOther };
  }

  progress('Building the test world …');
  const world = (await import('../../docs/test-world/world.json')).default as unknown as TestWorldFile;
  const [stages, contractors, users, general] = await Promise.all([
    readAll(d, 'stages'), readAll(d, 'contractors'), readAll(d, 'users'), readAll(d, 'general_apartments'),
  ]);
  const plan = buildTestWorld(world, {
    stages: stages as unknown as Stage[], contractors: contractors as unknown as Contractor[], users: users as unknown as User[],
    generalTiles: general as unknown as Apartment[],
    makeToken: () => Array.from(crypto.getRandomValues(new Uint8Array(24)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[n % 56]).join(''),
  });

  // Ids of ours a past remove buried: lift those first, or they would stay hidden.
  for (const pid of realWs) {
    const ids = plan.writes.filter(w => w.col === colName(pid, 'apartments') || w.col === colName(pid, 'canvasElements')).map(w => w.id);
    if (ids.length) await fsUntombstone(pid, ids);
  }

  progress(`Writing ${plan.writes.length} records …`);
  await commitAll(d, plan.writes.map(w => (b: ReturnType<typeof writeBatch>) => b.set(doc(d, w.col, w.id), { ...w.data, _updatedAt: serverTimestamp() })));

  progress('Adding the test towers to the workspaces …');
  await runTransaction(d, async tx => {
    const ref = doc(d, 'settings', 'app');
    const snap = await tx.get(ref);
    const cur = (snap.exists() ? snap.data() : {}) as Rec;
    const nextCustom = [...((cur.customProjects as Rec[] | undefined) ?? []), ...plan.projects.map(p => p.project)];
    const order = (cur.projectOrder as string[] | undefined) ?? [];
    const pairs: unknown[] = [new FieldPath('customProjects'), nextCustom];
    if (order.length) pairs.push(new FieldPath('projectOrder'), [...order, ...plan.projects.map(p => p.project.id)]);
    for (const p of plan.projects) pairs.push(new FieldPath('boardSettings', p.project.id), { buildings: p.buildings, [TW_FLAG]: true });
    pairs.push(new FieldPath('_updatedAt'), serverTimestamp());
    if (snap.exists()) tx.update(ref, pairs[0] as FieldPath, pairs[1], ...pairs.slice(2));
    else tx.set(ref, { customProjects: nextCustom, boardSettings: Object.fromEntries(plan.projects.map(p => [p.project.id, { buildings: p.buildings, [TW_FLAG]: true }])), _updatedAt: serverTimestamp() });
  });

  const slots = Object.fromEntries(Object.entries(plan.slots).map(([k, v]) => [k, v.name]));
  await commitAll(d, [(b) => b.set(doc(d, SAVED, MANIFEST), {
    [TW_FLAG]: true, world: `${world.meta.name} v${world.meta.version} (${world.meta.day})`, loadedBy: opts.by, loadedAt: serverTimestamp(),
    cleared: !!report, counts: plan.counts, slots, towers: plan.projects.map(p => p.project.id),
    keptReal: report?.keptReal ?? [],
  })]);
  return { cleared: report, written: plan.counts, slots };
}

export interface RemoveReport { deleted: Record<string, number>; restored: number; towers: number; madeOnTest: string[] }

/** Takes the test world out exactly, and puts back whatever the load cleared. */
export async function removeTestWorld(progress: Progress = () => {}): Promise<RemoveReport> {
  const d = practiceDb();
  const { custom, workspaces } = await readSettings(d);
  const towers = custom.filter(p => p[TW_FLAG] || String(p.id).startsWith(TW_PREFIX)).map(p => String(p.id));
  const manifest = (await testWorldStatus()).manifest;
  for (const t of (manifest?.towers as string[] | undefined) ?? []) if (!towers.includes(t)) towers.push(t);
  const all = [...new Set([...workspaces, ...towers])];

  // 1. Every test-world document.
  progress('Finding the test world\'s records …');
  const found: { col: string; id: string; pid: string | null; base: string }[] = [];
  const look = async (c: string, pid: string | null, base: string) => {
    const snap = await getDocs(query(collection(d, c), where(TW_FLAG, '==', true)));
    snap.docs.forEach(x => found.push({ col: c, id: x.id, pid, base }));
  };
  for (const pid of all) for (const base of WS_BASES) await look(colName(pid, base), pid, base);
  for (const c of GLOBALS_WITH_RECORDS) await look(c, null, c);
  // What people made on test records while testing goes too: everything in a
  // test tower, and anything elsewhere that hangs on a test flat, task or worker.
  const ours = new Set(found.map(x => x.id));
  const seen = new Set(found.map(x => `${x.col}/${x.id}`));
  const madeOnTest: string[] = [];
  const HANGS = ['apartmentId', 'assignmentId', 'contractorId'];
  for (const pid of all) {
    for (const base of [...WS_BASES, 'tombstones']) {
      if (!towers.includes(pid) && (base === 'apartments' || base === 'canvasElements' || base === 'tombstones' || base === 'boardLayouts')) continue;
      const c = colName(pid, base);
      for (const x of await readAll(d, c)) {
        const id = String(x.id);
        if (seen.has(`${c}/${id}`)) continue;
        if (towers.includes(pid) || HANGS.some(f => typeof x[f] === 'string' && ours.has(x[f] as string))) {
          found.push({ col: c, id, pid, base });
          seen.add(`${c}/${id}`);
          if (base !== 'tombstones' && base !== 'activityLogs') madeOnTest.push(`${c}/${id}`);
        }
      }
    }
  }
  const tomb: Record<string, string[]> = {};
  for (const x of found) if (x.pid && !towers.includes(x.pid) && TOMBSTONED.has(x.base)) (tomb[x.pid] ??= []).push(x.id);
  for (const [pid, ids] of Object.entries(tomb)) await fsTombstone(pid, ids);
  progress(`Removing ${found.length} test records …`);
  await commitAll(d, found.map(x => (b: ReturnType<typeof writeBatch>) => b.delete(doc(d, x.col, x.id))));

  // 2. The tower workspaces out of settings/app.
  await runTransaction(d, async tx => {
    const ref = doc(d, 'settings', 'app');
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const cur = snap.data() as Rec;
    const isOurs = (p: Rec) => !!p[TW_FLAG] || towers.includes(String(p.id));
    const pairs: unknown[] = [new FieldPath('customProjects'), ((cur.customProjects as Rec[] | undefined) ?? []).filter(p => !isOurs(p))];
    if (Array.isArray(cur.projectOrder)) pairs.push(new FieldPath('projectOrder'), (cur.projectOrder as string[]).filter(id => !towers.includes(id)));
    const bs = (cur.boardSettings as Rec | undefined) ?? {};
    for (const k of Object.keys(bs)) if (towers.includes(k) || (bs[k] as Rec | undefined)?.[TW_FLAG]) pairs.push(new FieldPath('boardSettings', k), deleteField());
    pairs.push(new FieldPath('_updatedAt'), serverTimestamp());
    tx.update(ref, pairs[0] as FieldPath, pairs[1], ...pairs.slice(2));
  });

  // 3. What the load cleared, back exactly.
  const saved = (await readAll(d, SAVED)).filter(x => x.id !== MANIFEST);
  progress(`Putting back ${saved.length} cleared records …`);
  await commitAll(d, saved.map(x => (b: ReturnType<typeof writeBatch>) => {
    const ref = doc(d, String(x.col), String(x.docId));
    if (x.op === 'deleted') b.set(ref, { ...(x.data as Rec), _updatedAt: serverTimestamp() });
    else b.update(ref, {
      ...(x.before as Rec),
      ...Object.fromEntries(((x.absent as string[] | undefined) ?? []).map(f => [f, deleteField()])),
      _updatedAt: serverTimestamp(),
    });
  }));
  const untomb: Record<string, string[]> = {};
  for (const x of saved) if (x.op === 'deleted' && x.workspace && TOMBSTONED.has(String(x.base))) (untomb[String(x.workspace)] ??= []).push(String(x.docId));
  for (const [pid, ids] of Object.entries(untomb)) await fsUntombstone(pid, ids);

  // 4. The copies and the manifest go last.
  await commitAll(d, [...saved.map(x => String(x.id)), MANIFEST].map(id => (b: ReturnType<typeof writeBatch>) => b.delete(doc(d, SAVED, id))));
  return { deleted: tally(found), restored: saved.length, towers: towers.length, madeOnTest };
}
