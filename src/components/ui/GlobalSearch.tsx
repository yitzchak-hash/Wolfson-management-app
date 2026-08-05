import React, { useState, useEffect, useRef } from 'react';
import {
  Search, X, Building2, ClipboardList, FileText, MessageSquare,
  HardHat, Layers, FolderOpen, StickyNote, PenLine,
} from 'lucide-react';
import Fuse from 'fuse.js';
import { useStore } from '../../data/store';
import { aptLabel, binLabelOf, binKeyOf, CanvasElement } from '../../types';
import { WIDGET_BY_ID } from '../../data/widgets';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  id: string;
  type: 'apartment' | 'task' | 'note' | 'contractor_note'
      | 'contractor' | 'stage' | 'board' | 'group' | 'markup';
  title: string;
  subtitle: string;
  aptId?: string;
  /** Where selecting it should take you, when it is not an apartment. */
  goto?: string;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const {
    apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages,
    canvasElements, planAnnotations, buildings, currentProjectId, setPendingOpenAptId,
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

    const OPTS = { threshold: 0.35, ignoreLocation: true, minMatchCharLength: 2 };
    const found: SearchResult[] = [];

    // Apartments
    const aptFuse = new Fuse(apartments.filter(a => !a.isUnnamed), {
      keys: ['displayName', 'apartmentNumber', 'generalNotes'], ...OPTS,
    });
    aptFuse.search(query).slice(0, 5).forEach(({ item: a }) => {
      found.push({
        id: `apt-${a.id}`, type: 'apartment',
        title: `${a.buildingId} · Apt ${aptLabel(a)}`,
        subtitle: a.generalNotes.trim() ? a.generalNotes.slice(0, 80) : `Floor ${a.floor}`,
        aptId: a.id,
      });
    });

    // Tasks
    const taskFuse = new Fuse(contractorAssignments, { keys: ['taskDescription'], ...OPTS });
    taskFuse.search(query).slice(0, 5).forEach(({ item: a }) => {
      const apt = apartments.find(ap => ap.id === a.apartmentId);
      const contractor = contractors.find(c => c.id === a.contractorId);
      found.push({
        id: `task-${a.id}`, type: 'task',
        title: a.taskDescription.slice(0, 60),
        subtitle: `${a.buildingId} · Apt ${aptLabel(apt)} · ${contractor?.name ?? ''}`,
        aptId: a.apartmentId,
      });
    });

    // Stage notes
    const noteFuse = new Fuse(stageNotes, { keys: ['noteText'], ...OPTS });
    noteFuse.search(query).slice(0, 5).forEach(({ item: n }) => {
      const apt = apartments.find(a => a.id === n.apartmentId);
      const stage = stages.find(st => st.id === n.stageId);
      found.push({
        id: `note-${n.id}`, type: 'note',
        title: n.noteText.slice(0, 60),
        subtitle: `${apt?.buildingId} · Apt ${aptLabel(apt)} · ${stage?.name ?? ''}`,
        aptId: n.apartmentId,
      });
    });

    // Contractor notes
    const cnoteFuse = new Fuse(contractorNotes, { keys: ['text'], ...OPTS });
    cnoteFuse.search(query).slice(0, 5).forEach(({ item: n }) => {
      const apt = apartments.find(a => a.id === n.apartmentId);
      found.push({
        id: `cnote-${n.id}`, type: 'contractor_note',
        title: n.text.slice(0, 60),
        subtitle: `${apt?.buildingId} · Apt ${aptLabel(apt)} · ${n.authorName}`,
        aptId: n.apartmentId,
      });
    });

    // ── Contractors ──
    const conFuse = new Fuse(contractors.filter(c => c.active), { keys: ['name', 'email'], ...OPTS });
    conFuse.search(query).slice(0, 4).forEach(({ item: c }) => {
      const open = contractorAssignments.filter(a => a.contractorId === c.id && !a.completedAt).length;
      found.push({
        id: `con-${c.id}`, type: 'contractor',
        title: c.name,
        subtitle: `${c.category} · ${open} open ${open === 1 ? 'task' : 'tasks'}`,
        goto: '/app-settings',
      });
    });

    // ── Stages ──
    const stageFuse = new Fuse(stages.filter(st => st.active), { keys: ['name', 'nameHe', 'description'], ...OPTS });
    stageFuse.search(query).slice(0, 4).forEach(({ item: st }) => {
      const n = apartments.filter(a => a.currentStageId === st.id).length;
      found.push({
        id: `stage-${st.id}`, type: 'stage',
        title: st.name,
        subtitle: `${n} ${n === 1 ? 'unit' : 'units'} at this stage`,
        goto: '/settings',
      });
    });

    // ── Groups on the board, and everything placed on it ──
    // "archive", "ready to start" and the like are things that exist and are
    // visible on screen; a search that could not find them was answering the
    // wrong question.
    const bins = canvasElements.filter(el => el.type === 'bin');
    const binFuse = new Fuse(bins.map(b => ({ el: b, name: binLabelOf(b) })), { keys: ['name'], ...OPTS });
    binFuse.search(query).slice(0, 4).forEach(({ item }) => {
      const n = apartments.filter(a => a.boardBin === binKeyOf(item.el)).length;
      found.push({
        id: `bin-${item.el.id}`, type: 'group',
        title: item.name,
        subtitle: `Group on the job board · ${n} ${n === 1 ? 'job' : 'jobs'}`,
        goto: '/jobs',
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
    const nodeFuse = new Fuse(nodeRows, { keys: ['text', 'kind'], ...OPTS });
    nodeFuse.search(query).slice(0, 5).forEach(({ item }) => {
      const bin = item.el.board ? bins.find(b => binKeyOf(b) === item.el.board) : undefined;
      found.push({
        id: `node-${item.el.id}`, type: 'board',
        title: item.text.slice(0, 60) || item.kind,
        subtitle: `${item.kind} on the job board${bin ? ` · in ${binLabelOf(bin)}` : ''}`,
        goto: '/jobs',
      });
    });

    // ── Marked-up plans ──
    const markFuse = new Fuse(planAnnotations, { keys: ['planName', 'createdBy', 'note'], ...OPTS });
    markFuse.search(query).slice(0, 4).forEach(({ item: m }) => {
      const apt = apartments.find(a => a.id === m.apartmentId);
      found.push({
        id: `mark-${m.id}`, type: 'markup',
        title: `${m.planName ?? 'Plan'} — version ${m.version}`,
        subtitle: `${apt ? aptLabel(apt) : 'Job'} · marked up by ${m.createdBy || 'the office'}`,
        aptId: m.apartmentId,
      });
    });

    setResults(found);
  }, [query, apartments, contractorAssignments, stageNotes, contractorNotes, contractors, stages,
      canvasElements, planAnnotations]);

  /**
   * Actually go there.
   *
   * This used to `navigate('/?apt=' + id)`. Nothing in the app has ever read
   * that query parameter, and `/` redirects to the job board — so choosing a
   * result closed the dialog and did nothing else. It goes through the same
   * mechanism the dashboard uses instead.
   */
  function handleSelect(result: SearchResult) {
    onClose();
    if (result.aptId) {
      setPendingOpenAptId(result.aptId);
      navigate(currentProjectId === 'general' ? '/jobs' : '/project');
      return;
    }
    if (result.goto) navigate(result.goto);
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
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="mt-0.5 flex-shrink-0">{TYPE_ICON[result.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{result.title}</div>
                  <div className="text-xs text-gray-400 truncate">{result.subtitle}</div>
                </div>
                <span className="text-[10px] text-gray-300 flex-shrink-0 pt-0.5">{TYPE_LABEL[result.type]}</span>
              </button>
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
