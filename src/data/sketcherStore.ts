/**
 * The Plan Sketcher's records, inside the management app (pick 6 / 33 — the
 * give-back). The sketch studio (`src/components/sketch/`) was built in the
 * sketcher's own repo over a small store of its own; here that store is this
 * ADAPTER: the same keys, the same action names and semantics (upsert by id,
 * merge by id, filter by id), the same `sketcher_*` Firestore collections —
 * so a sheet sketched in either app is the same sheet in the other. Nothing
 * here touches the job app's own collections, and the job app's store keeps
 * owning `mainUiStrings`, `planAnnotations` and `planPins`, which the studio
 * still reads from `useStore`.
 *
 * Storage: the same Firebase project, in `sketcher_items` · `sketcher_sheets`
 * · `sketcher_blocks` · `sketcher_shapes` · `sketcher_pipes` ·
 * `sketcher_exports` · `sketcher_plans` and the two rule documents in
 * `sketcher_settings` (`blockRules`, `pipeRules` — written WHOLE every time;
 * a merge cannot remove a key). localStorage `sketcher_app_data` is the
 * offline copy — a different origin from the sketcher's own, so the two
 * never collide. Firebase wins on every listener; writes go set-state →
 * fsSet/fsDelete → debounced persist, flushed on pagehide.
 */
import { create } from 'zustand';
import { fsDelete, fsGetAll, fsListen, fsSet, isFirebaseConfigured } from './firebase';
import type { SketchItem, SketchSheet, SketchExport } from './sketchItems';
import type { CatalogBlock, BlockRules } from './catalog';
import type { SketchShape } from './gvs';
import type { SketchPipe, PipeRules } from './pipes';

const STORAGE_KEY = 'sketcher_app_data';
const COL_PLANS = 'sketcher_plans';
const COL_ITEMS = 'sketcher_items';
const COL_SHEETS = 'sketcher_sheets';
const COL_BLOCKS = 'sketcher_blocks';
const COL_SHAPES = 'sketcher_shapes';
const COL_PIPES = 'sketcher_pipes';
const COL_EXPORTS = 'sketcher_exports';
const COL_SETTINGS = 'sketcher_settings';

/** A clean base the sketcher made (its B3–B5): the studio reads its scale so blocks stand at true size. */
export interface SketcherPlan {
  id: string;
  jobId?: string;
  projectId?: string;
  sourceFileId: string;
  sourceName: string;
  pageIndex: number;
  pageCount: number;
  cleanFileId: string;
  cleanUrl?: string;
  cleanName: string;
  folderId?: string;
  kind: 'scan' | 'drawn';
  dials: { colours: number; stains: number; crop: boolean };
  floor?: string;
  frameIndex?: number;
  layersOff?: string[];
  scale?: { mmPerPx: number; source: 'titleblock' | 'taps'; ratio?: number; text?: string };
  sheet?: { wMm: number; hMm: number; name: string };
  title?: { date?: string; architect?: string; project?: string; sheetNo?: string; scaleText?: string };
  width: number;
  height: number;
  createdAt: string;
  createdBy: string;
}

interface Stored {
  plans?: SketcherPlan[];
  items?: SketchItem[];
  sheets?: SketchSheet[];
  blocks?: CatalogBlock[];
  blockRules?: BlockRules;
  shapes?: SketchShape[];
  pipes?: SketchPipe[];
  pipeRules?: PipeRules;
  exports?: SketchExport[];
}
function loadStored(): Stored {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? (JSON.parse(raw) as Stored) : {}; } catch { return {}; }
}

export interface SketcherState {
  plans: SketcherPlan[];
  items: SketchItem[];
  addItem: (it: SketchItem) => void;
  updateItem: (id: string, changes: Partial<SketchItem>) => void;
  deleteItem: (id: string) => void;
  sheets: SketchSheet[];
  setSheet: (id: string, changes: Partial<Omit<SketchSheet, 'id'>>) => void;
  blocks: CatalogBlock[];
  addBlock: (b: CatalogBlock) => void;
  deleteBlock: (id: string) => void;
  blockRules: BlockRules;
  setBlockRule: (blockId: string, rule: BlockRules[string] | null) => void;
  shapes: SketchShape[];
  addShape: (sh: SketchShape) => void;
  updateShape: (id: string, changes: Partial<SketchShape>) => void;
  deleteShape: (id: string) => void;
  pipes: SketchPipe[];
  addPipe: (p: SketchPipe) => void;
  updatePipe: (id: string, changes: Partial<SketchPipe>) => void;
  deletePipe: (id: string) => void;
  pipeRules: PipeRules;
  setPipeRule: (kind: string, rule: PipeRules[keyof PipeRules] | null) => void;
  exports: SketchExport[];
  addExport: (e: SketchExport) => void;
}

const stored = loadStored();

/* ── persistence: debounced, flushed on pagehide ── */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistNow(get: () => SketcherState) {
  const st = get();
  const payload: Stored = { plans: st.plans, items: st.items, sheets: st.sheets, blocks: st.blocks, blockRules: st.blockRules, shapes: st.shapes, pipes: st.pipes, pipeRules: st.pipeRules, exports: st.exports };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) { console.warn('[sketcher] could not persist', e); }
}
function persist(get: () => SketcherState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { persistTimer = null; persistNow(get); }, 250);
}
export function flushSketcherPersist() { if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; persistNow(useSketchStore.getState); } }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSketcherPersist);
  window.addEventListener('beforeunload', flushSketcherPersist);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSketcherPersist(); });
}

export const useSketchStore = create<SketcherState>()((set, get) => ({
  plans: stored.plans ?? [],

  items: stored.items ?? [],
  addItem: (it) => { set(state => ({ items: [...state.items.filter(x => x.id !== it.id), it] })); fsSet(COL_ITEMS, it.id, it); persist(get); },
  updateItem: (id, changes) => {
    set(state => ({ items: state.items.map(x => (x.id === id ? { ...x, ...changes } : x)) }));
    const updated = get().items.find(x => x.id === id);
    if (updated) fsSet(COL_ITEMS, id, updated);
    persist(get);
  },
  deleteItem: (id) => { set(state => ({ items: state.items.filter(x => x.id !== id) })); fsDelete(COL_ITEMS, id); persist(get); },

  sheets: stored.sheets ?? [],
  setSheet: (id, changes) => {
    const prev = get().sheets.find(s => s.id === id);
    const next: SketchSheet = { id, systems: prev?.systems ?? ['A'], ...prev, ...changes, updatedAt: new Date().toISOString() };
    set(state => ({ sheets: [...state.sheets.filter(s => s.id !== id), next] }));
    fsSet(COL_SHEETS, id, next);
    persist(get);
  },

  blocks: stored.blocks ?? [],
  addBlock: (b) => { set(state => ({ blocks: [...state.blocks.filter(x => x.id !== b.id), b] })); fsSet(COL_BLOCKS, b.id, b); persist(get); },
  deleteBlock: (id) => { set(state => ({ blocks: state.blocks.filter(x => x.id !== id) })); fsDelete(COL_BLOCKS, id); persist(get); },

  blockRules: stored.blockRules ?? {},
  setBlockRule: (blockId, rule) => {
    const rules = { ...get().blockRules };
    if (rule && Object.keys(rule).length) rules[blockId] = rule; else delete rules[blockId];
    set({ blockRules: rules });
    fsSet(COL_SETTINGS, 'blockRules', { rules });   // the WHOLE map, every time
    persist(get);
  },

  shapes: stored.shapes ?? [],
  addShape: (sh) => { set(state => ({ shapes: [...state.shapes.filter(x => x.id !== sh.id), sh] })); fsSet(COL_SHAPES, sh.id, sh); persist(get); },
  updateShape: (id, changes) => {
    set(state => ({ shapes: state.shapes.map(x => (x.id === id ? { ...x, ...changes } : x)) }));
    const u = get().shapes.find(x => x.id === id); if (u) fsSet(COL_SHAPES, id, u);
    persist(get);
  },
  deleteShape: (id) => { set(state => ({ shapes: state.shapes.filter(x => x.id !== id) })); fsDelete(COL_SHAPES, id); persist(get); },

  pipes: stored.pipes ?? [],
  addPipe: (p) => { set(state => ({ pipes: [...state.pipes.filter(x => x.id !== p.id), p] })); fsSet(COL_PIPES, p.id, p); persist(get); },
  updatePipe: (id, changes) => {
    set(state => ({ pipes: state.pipes.map(x => (x.id === id ? { ...x, ...changes } : x)) }));
    const u = get().pipes.find(x => x.id === id); if (u) fsSet(COL_PIPES, id, u);
    persist(get);
  },
  deletePipe: (id) => { set(state => ({ pipes: state.pipes.filter(x => x.id !== id) })); fsDelete(COL_PIPES, id); persist(get); },

  pipeRules: stored.pipeRules ?? {},
  setPipeRule: (kind, rule) => {
    const rules = { ...get().pipeRules } as Record<string, unknown>;
    if (rule && Object.keys(rule).length) rules[kind] = rule; else delete rules[kind];
    set({ pipeRules: rules as PipeRules });
    fsSet(COL_SETTINGS, 'pipeRules', { rules });   // the whole map, every time
    persist(get);
  },

  exports: stored.exports ?? [],
  addExport: (e) => { set(state => ({ exports: [...state.exports.filter(x => x.id !== e.id), e] })); fsSet(COL_EXPORTS, e.id, e); persist(get); },
}));

/* ── Firestore sync: load once, then listen. Firebase wins. Started by the sketch page on first mount. ── */
let syncStarted = false;
const unsubs: Array<() => void> = [];
export async function startSketcherSync() {
  if (syncStarted || !isFirebaseConfigured) return;
  syncStarted = true;
  try {
    const [plans, settings, items, sheets, blocks, shapes, pipes, exportsDocs] = await Promise.all([
      fsGetAll(COL_PLANS), fsGetAll(COL_SETTINGS), fsGetAll(COL_ITEMS), fsGetAll(COL_SHEETS), fsGetAll(COL_BLOCKS),
      fsGetAll(COL_SHAPES), fsGetAll(COL_PIPES), fsGetAll(COL_EXPORTS),
    ]);
    const patch: Partial<SketcherState> = {};
    if (plans.length) patch.plans = plans as unknown as SketcherPlan[];
    if (items.length) patch.items = items as unknown as SketchItem[];
    if (sheets.length) patch.sheets = sheets as unknown as SketchSheet[];
    if (blocks.length) patch.blocks = blocks as unknown as CatalogBlock[];
    if (shapes.length) patch.shapes = shapes as unknown as SketchShape[];
    if (pipes.length) patch.pipes = pipes as unknown as SketchPipe[];
    if (exportsDocs.length) patch.exports = exportsDocs as unknown as SketchExport[];
    const rulesDoc = settings.find(d => (d as { id?: string }).id === 'blockRules') as { rules?: BlockRules } | undefined;
    if (rulesDoc?.rules) patch.blockRules = rulesDoc.rules;
    const pipeDoc = settings.find(d => (d as { id?: string }).id === 'pipeRules') as { rules?: PipeRules } | undefined;
    if (pipeDoc?.rules) patch.pipeRules = pipeDoc.rules;
    if (Object.keys(patch).length) { useSketchStore.setState(patch); persist(useSketchStore.getState); }
  } catch (e) {
    console.warn('[sketcher] initial sync failed; working from local storage', e);
  }
  const listen = <K extends keyof SketcherState>(col: string, key: K) =>
    unsubs.push(fsListen(col, docs => { useSketchStore.setState({ [key]: docs } as unknown as Partial<SketcherState>); persist(useSketchStore.getState); }));
  listen(COL_PLANS, 'plans'); listen(COL_ITEMS, 'items'); listen(COL_SHEETS, 'sheets'); listen(COL_BLOCKS, 'blocks');
  listen(COL_SHAPES, 'shapes'); listen(COL_PIPES, 'pipes'); listen(COL_EXPORTS, 'exports');
  unsubs.push(fsListen(COL_SETTINGS, docs => {
    const rulesDoc = docs.find(d => (d as { id?: string }).id === 'blockRules') as { rules?: BlockRules } | undefined;
    if (rulesDoc?.rules) { useSketchStore.setState({ blockRules: rulesDoc.rules }); persist(useSketchStore.getState); }
    const pipeDoc = docs.find(d => (d as { id?: string }).id === 'pipeRules') as { rules?: PipeRules } | undefined;
    if (pipeDoc?.rules) { useSketchStore.setState({ pipeRules: pipeDoc.rules }); persist(useSketchStore.getState); }
  }));
}
export function stopSketcherSync() { unsubs.splice(0).forEach(u => u()); syncStarted = false; }
