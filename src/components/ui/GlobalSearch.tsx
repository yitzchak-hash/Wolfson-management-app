import React, { useState, useEffect, useRef } from 'react';
import {
  Search, X, Building2, ClipboardList, FileText, MessageSquare,
  HardHat, Layers, FolderOpen, StickyNote, PenLine, Crosshair, Clock,
} from 'lucide-react';
import Fuse from 'fuse.js';
import { queryVariants, skeleton } from '../../data/translit';
import { useStore, loadProjectSnapshot } from '../../data/store';
import { aptLabel, binLabelOf, binKeyOf, CanvasElement, FocusIntent } from '../../types';
import { WIDGET_BY_ID } from '../../data/widgets';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  id: string;
  type: 'apartment' | 'task' | 'note' | 'contractor_note'
      | 'contractor' | 'stage' | 'board' | 'group' | 'markup';
  title: string;
  subtitle: string;
  /**
   * What this result IS, rather than where a route happens to live.
   *
   * Every result carries one. A stage used to carry `/settings`, which is where
   * a stage is renamed and not where it is seen — so choosing it answered a
   * question nobody had asked.
   */
  focus: FocusIntent;
  /**
   * Which workspace this lives in.
   *
   * The search reads every workspace, so a result has to carry its own or
   * choosing it would look the thing up in whichever one happens to be open
   * and find nothing.
   */
  projectId: string;
  /**
   * Does this thing have a PLACE you can be shown?
   *
   * A job, a group, a note or a widget sits somewhere; a worker and a stage do
   * not, so offering to fly to them would be a button that lands nowhere.
   */
  onBoard?: boolean;
  /**
   * How well it matched — LOWER is better, and the tier dominates.
   *
   * The list used to be insertion order: workers and stages were pushed before
   * any workspace's jobs, so a stage that scraped past the fuzzy threshold
   * ("concealed" is one letter off "lev") sat ABOVE the job literally named
   * "Lev". Every result now carries a rank — name-prefix first, then word
   * prefix, then substring, then fuzzy, then the other-alphabet passes — and
   * the whole list is sorted by it once, whatever order it was gathered in.
   */
  rank: number;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

/**
 * What was looked for lately.
 *
 * Per machine and never synced: what you searched for is about the hunt you
 * were on at this desk, not about the office's data, so it has no business in
 * the store, the backup or Firestore.
 */
const RECENT_KEY = 'search_recent';
const RECENT_MAX = 8;

/**
 * What was PICKED, so the search learns — the way Drive's does.
 *
 * Every chosen result is remembered with how often, how recently, and which
 * queries led to it. A result picked before for the query being typed goes
 * straight to the top; one picked before at all gets a nudge ahead of its
 * tier-mates. Per machine, like the recent searches, and for the same reason.
 */
const PICKS_KEY = 'search_picks';
const PICKS_MAX = 150;

interface PickMemory { n: number; last: number; qs: string[] }

function readPicks(): Record<string, PickMemory> {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}

function notePick(id: string, query: string) {
  try {
    const picks = readPicks();
    const q = query.trim().toLowerCase();
    const p = picks[id] ?? { n: 0, last: 0, qs: [] };
    p.n += 1;
    p.last = Date.now();
    if (q.length >= 2) p.qs = [q, ...p.qs.filter(x => x !== q)].slice(0, 6);
    picks[id] = p;
    const ids = Object.keys(picks);
    if (ids.length > PICKS_MAX) {
      ids.sort((a, b) => picks[a].last - picks[b].last)
        .slice(0, ids.length - PICKS_MAX)
        .forEach(k => delete picks[k]);
    }
    localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
  } catch { /* private window */ }
}

/** The learned adjustment for one result against one query. Negative = up. */
function pickBoost(id: string, query: string, picks: Record<string, PickMemory>): number {
  const p = picks[id];
  if (!p) return 0;
  const q = query.trim().toLowerCase();
  // Picked before while typing this very thing — the answer they meant.
  if (q.length >= 2 && p.qs.some(x => x.startsWith(q) || q.startsWith(x))) return -10000 - p.n;
  // Picked before at all — ahead of strangers in its own tier.
  return -Math.min(p.n, 5) * 8;
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(x => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function writeRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* private window */ }
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const {
    apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages,
    canvasElements, planAnnotations, buildings, projects, currentProjectId, setPendingFocus,
    setCurrentProject,
  } = useStore();
  const s = useStore(state => state.mainUiStrings);
  const ui = s;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  /**
   * Every OTHER workspace's data, read from its own cache.
   *
   * Loaded once when the dialog opens, not per keystroke: each one is a
   * JSON.parse of a whole workspace, and doing that three times per letter
   * typed would make the search stutter on a board of a thousand jobs.
   *
   * Only the open workspace is live. The others are whatever `persist()` last
   * wrote on THIS machine, which the footer says out loud rather than leaving
   * somebody to wonder why a job they know exists is not listed.
   */
  const [snaps, setSnaps] = useState<Record<string, ReturnType<typeof loadProjectSnapshot>>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setRecent(readRecent());
      const got: Record<string, ReturnType<typeof loadProjectSnapshot>> = {};
      projects.forEach(p => { if (p.id !== currentProjectId) got[p.id] = loadProjectSnapshot(p.id); });
      setSnaps(got);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, projects, currentProjectId]);

  // A workspace snapshot that arrived from the cloud after the dialog opened
  // is folded in — its own effect, so refreshing the snaps can never clear
  // what somebody is mid-way through typing.
  const snapTick = useStore(state => state.snapshotTick);
  useEffect(() => {
    if (!open) return;
    const got: Record<string, ReturnType<typeof loadProjectSnapshot>> = {};
    projects.forEach(p => { if (p.id !== currentProjectId) got[p.id] = loadProjectSnapshot(p.id); });
    setSnaps(got);
  }, [snapTick]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }

    /**
     * One matcher for every category, and it forgives three things at once:
     *
     *  · misspelling — the threshold is loose enough that "tedet" still finds
     *    "Tester";
     *  · the other alphabet — every text is also indexed as its consonant
     *    skeleton, so "shapira" finds "שפירא" and "ארצי" finds "Artzi";
     *  · the wrong keyboard layout — the query is also tried as what the same
     *    keys would have produced on the other layout.
     *
     * Plain-spelling matches rank first; the forgiving passes only add what
     * spelling alone did not find.
     */
    const V = queryVariants(query);
    /**
     * Every match comes back RANKED, lower first:
     *
     *   0   the text starts with what was typed        ("Lev" → "Levine")
     *   5   a word of it does                          ("lev" → "Molly Lev")
     *   100 it appears somewhere inside                ("lev" → "Shalev")
     *   200 fuzzy — a misspelling within the threshold ("tedet" → "Tester")
     *   300 the other-alphabet / wrong-keyboard passes
     *
     * The prefix tiers are checked outright rather than through Fuse, because
     * a fuzzy score cannot tell "Levine" (really starts with it) from
     * "concealed" (one letter off "lev") — and that difference is the whole
     * complaint. Fuzzy and skeleton only ADD what the plain tiers missed.
     */
    function hunt<T>(items: T[], keys: string[], textOf: (t: T) => string, limit: number): { it: T; rank: number }[] {
      const f = new Fuse(items, { keys, threshold: 0.45, ignoreLocation: true, minMatchCharLength: 2, includeScore: true });
      const rows = items.map(it => ({ it, s: skeleton(textOf(it)) })).filter(r => r.s.length >= 2);
      const fs = new Fuse(rows, { keys: ['s'], threshold: 0.34, ignoreLocation: true, minMatchCharLength: 2, includeScore: true });
      const best = new Map<T, number>();
      const put = (it: T, rank: number) => {
        const b = best.get(it);
        if (b === undefined || rank < b) best.set(it, rank);
      };
      for (const q of V.plain) {
        const ql = q.toLowerCase();
        if (ql.length < 2) continue;
        for (const it of items) {
          const text = textOf(it).toLowerCase();
          if (!text) continue;
          if (text.startsWith(ql)) put(it, 0);
          else if (text.split(/[\s,.·—/()-]+/).some(w => w.startsWith(ql))) put(it, 5);
          else if (text.includes(ql)) put(it, 100);
        }
      }
      V.plain.forEach(q => f.search(q).forEach(r => put(r.item, 200 + (r.score ?? 0.45) * 90)));
      V.skeletons.forEach(q => fs.search(q).forEach(r => put(r.item.it, 300 + (r.score ?? 0.34) * 90)));
      return [...best.entries()]
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([it, rank]) => ({ it, rank }));
    }

    /**
     * A small, per-kind nudge INSIDE a tier: with the same quality of match, a
     * job outranks a group, a group a worker, and a stage comes last — a stage
     * is the rarest thing anybody is hunting for by name. Deliberately smaller
     * than a tier step, so it can never lift a fuzzy match over a real one.
     */
    const KIND: Record<SearchResult['type'], number> = {
      apartment: 0, group: 1, contractor: 2, task: 3, board: 4,
      note: 5, contractor_note: 6, markup: 7, stage: 8,
    };

    const found: SearchResult[] = [];

    /**
     * One workspace's worth of searching.
     *
     * Called once per workspace: the open one from the live store, the rest
     * from the snapshot each last wrote on this machine. Everything below used
     * to read the store directly, which is exactly why the search only ever
     * found things in whichever workspace happened to be open.
     */
    function searchOne(pid: string, workspace: string, W: {
      apartments: typeof apartments;
      assignments: typeof contractorAssignments;
      stageNotes: typeof stageNotes;
      contractorNotes: typeof contractorNotes;
      canvasElements: typeof canvasElements;
      planAnnotations: typeof planAnnotations;
    }) {
    const { apartments, assignments: contractorAssignments, stageNotes,
            contractorNotes, canvasElements, planAnnotations } = W;

    /**
     * Trash is the one group search never offers — the user threw it away, and
     * a result that goes nowhere is worse than no result (confirmed). Jobs in
     * Done / Ready / Archive still appear, labeled with their group.
     */
    const bins = canvasElements.filter(el => el.type === 'bin');
    const groupNameOf = (a: { boardBin?: string }): string | null => {
      if (!a.boardBin) return null;
      const el = bins.find(b => binKeyOf(b) === a.boardBin);
      return el ? binLabelOf(el) : a.boardBin;
    };
    /**
     * Where a unit is, in words somebody recognises.
     *
     * Every result used to read `${buildingId} · Apt ${label}` — which on the
     * Job Board, where every record carries the internal building id `G`, came
     * out as "G · Apt Weinstein" on every single row. "G" is a storage detail
     * and "Apt" is wrong for a job. This says the workspace, then the building
     * when there is one, then the group it is filed in.
     */
    const onBoard = pid === 'general';
    // With the same quality of match, the workspace in front of you first.
    const wsBias = pid === currentProjectId ? 0 : 2;
    const whereIs = (a?: { buildingId?: string; boardBin?: string; floor?: number }): string => {
      if (!a) return workspace;
      const bits = [workspace];
      if (!onBoard && a.buildingId) bits.push(`Building ${a.buildingId}`);
      const g = groupNameOf(a);
      if (g) bits.push(`In ${g}`);
      return bits.filter(Boolean).join(' · ');
    };

    const searchableApts = apartments.filter(a => !a.isUnnamed && a.boardBin !== 'trash');
    const trashed = new Set(apartments.filter(a => a.boardBin === 'trash').map(a => a.id));

    // Apartments
    hunt(searchableApts, ['displayName', 'apartmentNumber', 'generalNotes'],
      a => `${a.displayName} ${a.apartmentNumber}`, 6).forEach(({ it: a, rank }) => {
      const extra = a.generalNotes.trim()
        ? a.generalNotes.split('\n')[0].slice(0, 60)
        : (!onBoard && a.floor ? `Floor ${a.floor}` : '');
      found.push({
        id: `apt-${a.id}`, type: 'apartment',
        title: aptLabel(a) || (onBoard ? 'Job' : 'Unit'),
        subtitle: [whereIs(a), extra].filter(Boolean).join(' · '),
        focus: { kind: 'apartment', id: a.id },
        projectId: pid,
        onBoard: true,
        rank: rank + KIND.apartment + wsBias,
      });
    });

    // Tasks — a task on a trashed job left every list; it leaves this one too.
    hunt(contractorAssignments.filter(t => !trashed.has(t.apartmentId)),
      ['taskDescription'], t => t.taskDescription, 3).forEach(({ it: a, rank }) => {
      const apt = apartments.find(ap => ap.id === a.apartmentId);
      const contractor = contractors.find(c => c.id === a.contractorId);
      found.push({
        id: `task-${a.id}`, type: 'task',
        title: a.taskDescription.slice(0, 60),
        subtitle: [aptLabel(apt), contractor?.name, whereIs(apt)].filter(Boolean).join(' · '),
        focus: { kind: 'task', id: a.id, apartmentId: a.apartmentId },
        projectId: pid,
        onBoard: true,
        rank: rank + KIND.task + wsBias,
      });
    });

    // Stage notes
    hunt(stageNotes.filter(n => !trashed.has(n.apartmentId)),
      ['noteText'], n => n.noteText, 3).forEach(({ it: n, rank }) => {
      const apt = apartments.find(a => a.id === n.apartmentId);
      const stage = stages.find(st => st.id === n.stageId);
      found.push({
        id: `note-${n.id}`, type: 'note',
        title: n.noteText.slice(0, 60),
        subtitle: [aptLabel(apt), stage?.name, whereIs(apt)].filter(Boolean).join(' · '),
        focus: { kind: 'apartment', id: n.apartmentId },
        projectId: pid,
        onBoard: true,
        rank: rank + KIND.note + wsBias,
      });
    });

    // Contractor notes
    hunt(contractorNotes.filter(n => !trashed.has(n.apartmentId)),
      ['text'], n => n.text, 3).forEach(({ it: n, rank }) => {
      const apt = apartments.find(a => a.id === n.apartmentId);
      found.push({
        id: `cnote-${n.id}`, type: 'contractor_note',
        title: n.text.slice(0, 60),
        subtitle: [aptLabel(apt), n.authorName, whereIs(apt)].filter(Boolean).join(' · '),
        focus: { kind: 'apartment', id: n.apartmentId },
        projectId: pid,
        onBoard: true,
        rank: rank + KIND.contractor_note + wsBias,
      });
    });

    // ── Groups on the board, and everything placed on it ──
    hunt(bins.map(b => ({ el: b, name: binLabelOf(b) })), ['name'], b => b.name, 4)
      .forEach(({ it: item, rank }) => {
      const n = apartments.filter(a => a.boardBin === binKeyOf(item.el)).length;
      found.push({
        id: `bin-${item.el.id}`, type: 'group',
        title: item.name,
        subtitle: `Group on the job board · ${n} ${n === 1 ? 'job' : 'jobs'}`,
        focus: { kind: 'group', id: item.el.id },
        projectId: pid,
        onBoard: true,
        rank: rank + KIND.group + wsBias,
      });
    });

    const nodeRows = canvasElements
      .filter(el => el.type !== 'bin' && el.type !== 'stroke' && el.type !== 'arrow')
      .map((el: CanvasElement) => ({
        el,
        text: `${el.text ?? ''} ${el.docName ?? ''} ${
          el.data ? Object.values(el.data).filter(v => typeof v === 'string').join(' ') : ''}`.trim(),
        kind: el.widget ? (WIDGET_BY_ID.get(el.widget)?.name ?? 'Widget') : el.type,
      }))
      .filter(r => r.text);
    hunt(nodeRows, ['text', 'kind'], r => r.text, 3).forEach(({ it: item, rank }) => {
      const bin = item.el.board ? bins.find(b => binKeyOf(b) === item.el.board) : undefined;
      found.push({
        id: `node-${item.el.id}`, type: 'board',
        title: item.text.slice(0, 60) || item.kind,
        subtitle: `${item.kind} on the job board${bin ? ` · in ${binLabelOf(bin)}` : ''}`,
        focus: { kind: 'node', id: item.el.id },
        projectId: pid,
        onBoard: true,
        rank: rank + KIND.board + wsBias,
      });
    });

    // ── Marked-up plans ──
    hunt(planAnnotations.filter(m => !trashed.has(m.apartmentId)),
      ['planName', 'createdBy', 'note'], m => m.planName ?? '', 4).forEach(({ it: m, rank }) => {
      const apt = apartments.find(a => a.id === m.apartmentId);
      found.push({
        id: `mark-${m.id}`, type: 'markup',
        title: `${m.planName ?? 'Plan'} — version ${m.version}`,
        subtitle: `${apt ? aptLabel(apt) : 'Job'} · marked up by ${m.createdBy || 'the office'}`,
        focus: { kind: 'markup', apartmentId: m.apartmentId },
        projectId: pid,
        rank: rank + KIND.markup + wsBias,
      });
    });

    }

    /**
     * Workers and stages are GLOBAL — bare collections shared by every
     * workspace — so they are searched ONCE, not once per workspace, or the
     * same worker would come back three times.
     */
    const aptsOf = (pid: string) =>
      (pid === currentProjectId ? apartments : snaps[pid]?.apartments) ?? [];

    // ── Workers ──
    // A worker belongs to the company, not to a workspace, and choosing one
    // shows their task list — which is the one you are standing in.
    hunt(contractors.filter(c => c.active), ['name', 'email'], c => c.name, 4).forEach(({ it: c, rank }) => {
      const open = contractorAssignments.filter(a => a.contractorId === c.id && !a.completedAt).length;
      found.push({
        id: `con-${c.id}`, type: 'contractor',
        title: c.name,
        subtitle: `${c.category} · ${open} open ${open === 1 ? 'task' : 'tasks'} here`,
        focus: { kind: 'contractor', id: c.id },
        projectId: currentProjectId,
        rank: rank + KIND.contractor,
      });
    });

    // ── Stages ──
    // A stage carrying `projectId: 'general'` is the Job Board's own; anything
    // else is shared, so it is shown where you are.
    hunt(stages.filter(st => st.active), ['name', 'nameHe', 'description'],
      st => `${st.name} ${st.nameHe ?? ''}`, 4).forEach(({ it: st, rank }) => {
      const pid = st.projectId === 'general' ? 'general' : currentProjectId;
      const n = aptsOf(pid).filter(a => a.currentStageId === st.id).length;
      const where = projects.find(p => p.id === pid)?.name ?? '';
      found.push({
        id: `stage-${st.id}`, type: 'stage',
        title: st.name,
        subtitle: `${where} · ${n} ${n === 1 ? 'unit' : 'units'} at this stage`,
        focus: { kind: 'stage', id: st.id },
        projectId: pid,
        rank: rank + KIND.stage,
      });
    });


    /**
     * Every workspace, the open one from the live store and the rest from
     * their own caches. The open one goes FIRST so what is in front of you
     * ranks above what is not.
     */
    const order = [...projects].sort((a, b2) =>
      (a.id === currentProjectId ? -1 : 0) - (b2.id === currentProjectId ? -1 : 0));
    order.forEach(p => {
      const live = p.id === currentProjectId;
      const W = live
        ? { apartments, assignments: contractorAssignments, stageNotes,
            contractorNotes, canvasElements, planAnnotations }
        : snaps[p.id];
      if (!W) return;                       // a workspace with nothing cached here
      searchOne(p.id, p.name, W);
    });

    /**
     * ONE sort over everything, whatever order it was gathered in — the tiers
     * first, the learned picks on top of them. A stable sort, so two results
     * with the same rank keep the gather order (open workspace first).
     */
    const picks = readPicks();
    found.sort((a, b) =>
      (a.rank + pickBoost(a.id, query, picks)) - (b.rank + pickBoost(b.id, query, picks)));
    setResults(found);
  }, [query, apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages,
      canvasElements, planAnnotations, projects, currentProjectId, snaps]);

  /**
   * Actually go and SHOW it.
   *
   * The page is chosen by what the thing is: a stage is seen on the board or
   * the diagram, filtered to it; a worker is seen on the task list, filtered to
   * them; a group is seen by opening it. The intent travels with the
   * navigation and the arriving page consumes it, so neither end has to know
   * anything about the other's internals.
   */
  /** Remember what was looked for, newest first and never twice. */
  function remember(q: string) {
    const t = q.trim();
    if (t.length < 2) return;
    const next = [t, ...readRecent().filter(x => x.toLowerCase() !== t.toLowerCase())];
    writeRecent(next);
    setRecent(next.slice(0, RECENT_MAX));
  }

  /**
   * Arrive in the result's OWN workspace before asking to be shown the thing.
   *
   * The order matters and is the documented one: `setCurrentProject` clears
   * `pendingFocus` as part of arriving somewhere new, so the intent is handed
   * over AFTER the switch. The other way round it is thrown away and the row
   * appears to do nothing.
   */
  function goTo(result: SearchResult, focus: FocusIntent) {
    onClose();
    remember(query);
    // The learning half: what was chosen, for what was typed. Next time the
    // same few letters go in, this result is the first answer.
    notePick(result.id, query);
    if (result.projectId !== currentProjectId) setCurrentProject(result.projectId);
    setPendingFocus(focus);
    const jobBoard = result.projectId === 'general';
    switch (focus.kind) {
      case 'contractor':
        navigate('/tasks'); break;
      case 'group':
      case 'node':
        navigate('/jobs'); break;
      default:
        // Apartments, tasks, notes, stages and markups all live on whichever
        // surface that workspace uses to show its jobs.
        navigate(jobBoard ? '/jobs' : '/project');
    }
  }

  /**
   * Show me where it is, and stop there.
   *
   * The row takes you to the thing AND opens it, which is usually what you
   * wanted. This answers the other question — whereabouts does it actually sit
   * — by travelling there and pulsing, leaving the board or the diagram on
   * screen instead of a drawer over it.
   */
  function handleReveal(result: SearchResult) {
    goTo(result, result.focus.kind === 'apartment'
      ? { ...result.focus, reveal: true }
      : result.focus);
  }

  function handleSelect(result: SearchResult) {
    goTo(result, result.focus);
  }

  const TYPE_ICON: Record<SearchResult['type'], React.ReactNode> = {
    apartment: <Building2 size={14} className="text-[#1e3a5f]" />,
    task: <ClipboardList size={14} className="text-amber-500" />,
    note: <FileText size={14} className="text-blue-500" />,
    contractor_note: <MessageSquare size={14} className="text-green-500" />,
    contractor: <HardHat size={14} className="text-orange-500" />,
    stage: <Layers size={14} className="text-violet-500" />,
    group: <FolderOpen size={14} className="text-fuchsia-600" />,
    board: <StickyNote size={14} className="text-teal-600" />,
    markup: <PenLine size={14} className="text-rose-500" />,
  };

  const TYPE_LABEL: Record<SearchResult['type'], string> = {
    apartment: s.searchTypeApartment, task: s.searchTypeTask, note: s.searchTypeNote,
    contractor_note: s.searchTypeContractorNote,
    contractor: 'Contractor', stage: 'Stage', group: 'Group', board: 'On the board', markup: 'Markup',
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') remember(query); }}
            data-enter-own
            placeholder={s.searchPlaceholder}
            className="flex-1 text-sm focus:outline-none text-gray-900 placeholder:text-gray-400"
          />
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {results.length > 0 ? (
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {results.map(result => (
              // A ROW, not a button — "Show on board" sits inside it, and a
              // button inside a button is invalid markup browsers flatten.
              <div
                key={result.id}
                role="button"
                tabIndex={-1}
                onClick={() => handleSelect(result)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors
                           text-left cursor-pointer group/row"
              >
                <div className="mt-0.5 flex-shrink-0">{TYPE_ICON[result.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{result.title}</div>
                  <div className="text-xs text-gray-400 truncate">{result.subtitle}</div>
                </div>
                {result.onBoard && (
                  <button
                    onClick={e => { e.stopPropagation(); handleReveal(result); }}
                    title="Show it on the board"
                    className="flex-shrink-0 p-1.5 -my-0.5 rounded-lg text-gray-300
                               hover:text-[#1e3a5f] hover:bg-[#4aa8d8]/12 transition-colors"
                  >
                    <Crosshair size={14} />
                  </button>
                )}
                <span className="text-[10px] text-gray-300 flex-shrink-0 pt-0.5">{TYPE_LABEL[result.type]}</span>
              </div>
            ))}
          </div>
        ) : query.trim() ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">{s.searchNoResults} "{query}"</div>
        ) : recent.length > 0 ? (
          /* What you looked for lately. Kept on this machine only — what you
             searched for is about the hunt you were on at this desk. */
          <div className="py-1">
            <div className="flex items-center justify-between px-4 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {ui.isRtl ? 'חיפושים אחרונים' : 'Recent searches'}
              </span>
              <button
                onClick={() => { writeRecent([]); setRecent([]); }}
                className="text-[10.5px] text-gray-400 hover:text-gray-600"
              >
                {ui.isRtl ? 'לנקות' : 'Clear'}
              </button>
            </div>
            {recent.map(r => (
              <button
                key={r}
                onClick={() => { setQuery(r); inputRef.current?.focus(); }}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-start"
              >
                <Clock size={13} className="text-gray-300 flex-shrink-0" />
                <span className="text-sm text-gray-600 truncate">{r}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">{s.searchStartTyping}</div>
        )}

        {/* Only the open workspace is live; the rest are whatever this machine
            last saw. Said out loud, because otherwise a job somebody knows
            exists is simply missing with no explanation. */}
        {projects.length > 1 && (
          <div className="px-4 py-1.5 border-t border-gray-100 text-[10.5px] text-gray-400">
            {ui.isRtl
              ? 'מחפש בכל סביבות העבודה. סביבה שלא נפתחה במחשב הזה מוצגת לפי מה שנשמר כאן לאחרונה.'
              : 'Searching every workspace. The ones that are not open show what this machine last saw of them.'}
          </div>
        )}
      </div>
    </div>
  );
}
