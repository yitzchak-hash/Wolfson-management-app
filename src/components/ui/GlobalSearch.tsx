import React, { useState, useEffect, useRef } from 'react';
import {
  Search, X, Building2, ClipboardList, FileText, MessageSquare,
  HardHat, Layers, FolderOpen, StickyNote, PenLine, Crosshair,
} from 'lucide-react';
import Fuse from 'fuse.js';
import { queryVariants, skeleton } from '../../data/translit';
import { useStore } from '../../data/store';
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
   * Does this thing have a PLACE you can be shown?
   *
   * A job, a group, a note or a widget sits somewhere; a worker and a stage do
   * not, so offering to fly to them would be a button that lands nowhere.
   */
  onBoard?: boolean;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const {
    apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages,
    canvasElements, planAnnotations, buildings, projects, currentProjectId, setPendingFocus,
  } = useStore();
  const s = useStore(state => state.mainUiStrings);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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
    function hunt<T>(items: T[], keys: string[], textOf: (t: T) => string, limit: number): T[] {
      const f = new Fuse(items, { keys, threshold: 0.45, ignoreLocation: true, minMatchCharLength: 2 });
      const rows = items.map(it => ({ it, s: skeleton(textOf(it)) })).filter(r => r.s.length >= 2);
      const fs = new Fuse(rows, { keys: ['s'], threshold: 0.34, ignoreLocation: true, minMatchCharLength: 2 });
      const out: T[] = [];
      const seen = new Set<T>();
      const take = (it: T) => { if (!seen.has(it)) { seen.add(it); out.push(it); } };
      V.plain.forEach(q => f.search(q).forEach(r => take(r.item)));
      V.skeletons.forEach(q => fs.search(q).forEach(r => take(r.item.it)));
      return out.slice(0, limit);
    }

    const found: SearchResult[] = [];

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
    const workspace = projects.find(p => p.id === currentProjectId)?.name ?? '';
    const onBoard = currentProjectId === 'general';
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
      a => `${a.displayName} ${a.apartmentNumber}`, 5).forEach(a => {
      const extra = a.generalNotes.trim()
        ? a.generalNotes.split('\n')[0].slice(0, 60)
        : (!onBoard && a.floor ? `Floor ${a.floor}` : '');
      found.push({
        id: `apt-${a.id}`, type: 'apartment',
        title: aptLabel(a) || (onBoard ? 'Job' : 'Unit'),
        subtitle: [whereIs(a), extra].filter(Boolean).join(' · '),
        focus: { kind: 'apartment', id: a.id },
        onBoard: true,
      });
    });

    // Tasks — a task on a trashed job left every list; it leaves this one too.
    hunt(contractorAssignments.filter(t => !trashed.has(t.apartmentId)),
      ['taskDescription'], t => t.taskDescription, 5).forEach(a => {
      const apt = apartments.find(ap => ap.id === a.apartmentId);
      const contractor = contractors.find(c => c.id === a.contractorId);
      found.push({
        id: `task-${a.id}`, type: 'task',
        title: a.taskDescription.slice(0, 60),
        subtitle: [aptLabel(apt), contractor?.name, whereIs(apt)].filter(Boolean).join(' · '),
        focus: { kind: 'task', id: a.id, apartmentId: a.apartmentId },
        onBoard: true,
      });
    });

    // Stage notes
    hunt(stageNotes.filter(n => !trashed.has(n.apartmentId)),
      ['noteText'], n => n.noteText, 5).forEach(n => {
      const apt = apartments.find(a => a.id === n.apartmentId);
      const stage = stages.find(st => st.id === n.stageId);
      found.push({
        id: `note-${n.id}`, type: 'note',
        title: n.noteText.slice(0, 60),
        subtitle: [aptLabel(apt), stage?.name, whereIs(apt)].filter(Boolean).join(' · '),
        focus: { kind: 'apartment', id: n.apartmentId },
        onBoard: true,
      });
    });

    // Contractor notes
    hunt(contractorNotes.filter(n => !trashed.has(n.apartmentId)),
      ['text'], n => n.text, 5).forEach(n => {
      const apt = apartments.find(a => a.id === n.apartmentId);
      found.push({
        id: `cnote-${n.id}`, type: 'contractor_note',
        title: n.text.slice(0, 60),
        subtitle: [aptLabel(apt), n.authorName, whereIs(apt)].filter(Boolean).join(' · '),
        focus: { kind: 'apartment', id: n.apartmentId },
        onBoard: true,
      });
    });

    // ── Workers ──
    hunt(contractors.filter(c => c.active), ['name', 'email'], c => c.name, 4).forEach(c => {
      const open = contractorAssignments.filter(a => a.contractorId === c.id && !a.completedAt).length;
      found.push({
        id: `con-${c.id}`, type: 'contractor',
        title: c.name,
        subtitle: `${c.category} · ${open} open ${open === 1 ? 'task' : 'tasks'}`,
        focus: { kind: 'contractor', id: c.id },
      });
    });

    // ── Stages ──
    hunt(stages.filter(st => st.active), ['name', 'nameHe', 'description'],
      st => `${st.name} ${st.nameHe ?? ''}`, 4).forEach(st => {
      const n = apartments.filter(a => a.currentStageId === st.id).length;
      found.push({
        id: `stage-${st.id}`, type: 'stage',
        title: st.name,
        subtitle: `${n} ${n === 1 ? 'unit' : 'units'} at this stage`,
        focus: { kind: 'stage', id: st.id },
      });
    });

    // ── Groups on the board, and everything placed on it ──
    hunt(bins.map(b => ({ el: b, name: binLabelOf(b) })), ['name'], b => b.name, 4)
      .forEach(item => {
      const n = apartments.filter(a => a.boardBin === binKeyOf(item.el)).length;
      found.push({
        id: `bin-${item.el.id}`, type: 'group',
        title: item.name,
        subtitle: `Group on the job board · ${n} ${n === 1 ? 'job' : 'jobs'}`,
        focus: { kind: 'group', id: item.el.id },
        onBoard: true,
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
    hunt(nodeRows, ['text', 'kind'], r => r.text, 5).forEach(item => {
      const bin = item.el.board ? bins.find(b => binKeyOf(b) === item.el.board) : undefined;
      found.push({
        id: `node-${item.el.id}`, type: 'board',
        title: item.text.slice(0, 60) || item.kind,
        subtitle: `${item.kind} on the job board${bin ? ` · in ${binLabelOf(bin)}` : ''}`,
        focus: { kind: 'node', id: item.el.id },
        onBoard: true,
      });
    });

    // ── Marked-up plans ──
    hunt(planAnnotations.filter(m => !trashed.has(m.apartmentId)),
      ['planName', 'createdBy', 'note'], m => m.planName ?? '', 4).forEach(m => {
      const apt = apartments.find(a => a.id === m.apartmentId);
      found.push({
        id: `mark-${m.id}`, type: 'markup',
        title: `${m.planName ?? 'Plan'} — version ${m.version}`,
        subtitle: `${apt ? aptLabel(apt) : 'Job'} · marked up by ${m.createdBy || 'the office'}`,
        focus: { kind: 'markup', apartmentId: m.apartmentId },
      });
    });

    setResults(found);
  }, [query, apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages,
      canvasElements, planAnnotations, projects, currentProjectId]);

  /**
   * Actually go and SHOW it.
   *
   * The page is chosen by what the thing is: a stage is seen on the board or
   * the diagram, filtered to it; a worker is seen on the task list, filtered to
   * them; a group is seen by opening it. The intent travels with the
   * navigation and the arriving page consumes it, so neither end has to know
   * anything about the other's internals.
   */
  const board = currentProjectId === 'general';

  /**
   * Show me where it is, and stop there.
   *
   * The row takes you to the thing AND opens it, which is usually what you
   * wanted. This answers the other question — whereabouts on the board does it
   * actually sit — by flying there and pulsing, leaving the board on screen.
   */
  function handleReveal(result: SearchResult) {
    onClose();
    setPendingFocus(
      result.focus.kind === 'apartment'
        ? { ...result.focus, reveal: true }
        : result.focus,
    );
    navigate('/jobs');
  }

  function handleSelect(result: SearchResult) {
    onClose();
    setPendingFocus(result.focus);
    switch (result.focus.kind) {
      case 'contractor':
        navigate('/tasks'); break;
      case 'group':
      case 'node':
        navigate('/jobs'); break;
      default:
        // Apartments, tasks, notes, stages and markups all live on whichever
        // surface this workspace uses to show its jobs.
        navigate(board ? '/jobs' : '/project');
    }
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
                {result.onBoard && board && (
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
        ) : (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">{s.searchStartTyping}</div>
        )}
      </div>
    </div>
  );
}
